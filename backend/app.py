"""Flask API for the Museum Companion RAG chat."""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "paintings.json"
MODEL_ID = os.environ.get("MODEL_ID", "HuggingFaceTB/SmolLM2-135M-Instruct")

app = Flask(__name__)


@lru_cache(maxsize=1)
def catalogue() -> dict[str, dict[str, Any]]:
    """Read the artwork catalogue once per process, indexed by artwork id."""
    with DATA_FILE.open(encoding="utf-8") as file:
        data = json.load(file)
    return {painting["id"]: painting for painting in data["paintings"]}


def public_painting(painting: dict[str, Any]) -> dict[str, Any]:
    """Keep source text out of the browser payload while exposing provenance."""
    result = {key: value for key, value in painting.items() if key != "knowledge_base"}
    result["sources"] = [
        {key: source[key] for key in ("id", "title", "type", "url") if key in source}
        for source in painting["knowledge_base"]
    ]
    return result


def words(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-ZÀ-ÿ]{3,}", text.lower()))


def retrieve(question: str, painting: dict[str, Any], limit: int = 3) -> list[dict[str, str]]:
    """A small, transparent lexical retriever for JSON-provided source text.

    Each source may use `content` (recommended), a local `path`, or a URL after an
    ingestion step. Keeping extracted text in JSON makes answers reproducible.
    """
    query_terms = words(question)
    ranked = []
    for source in painting["knowledge_base"]:
        content = source.get("content", "").strip()
        if not content:
            continue
        score = len(query_terms & words(content))
        ranked.append((score, source, content))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [
        {"id": source["id"], "title": source["title"], "url": source.get("url"), "content": content}
        for _, source, content in ranked[:limit]
    ]


@lru_cache(maxsize=1)
def generator():
    """Load the model lazily so listing artwork does not download model weights."""
    from transformers import pipeline

    return pipeline("text-generation", model=MODEL_ID, device_map="auto")


def generate_answer(question: str, painting: dict[str, Any], passages: list[dict[str, str]]) -> str:
    context = "\n\n".join(f"[{item['id']}] {item['content']}" for item in passages)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a concise, thoughtful museum guide. Answer only from the supplied "
                "artwork context. If it does not contain the answer, say so plainly. Do not invent facts."
            ),
        },
        {
            "role": "user",
            "content": f"Artwork: {painting['title']} by {painting['artist']} ({painting['date']}).\n"
            f"Context:\n{context}\n\nQuestion: {question}",
        },
    ]
    output = generator()(messages, max_new_tokens=180, do_sample=False)
    # The Transformers chat pipeline returns the complete message list.
    generated = output[0]["generated_text"]
    if isinstance(generated, list):
        return generated[-1]["content"].strip()
    return str(generated).strip()


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL_ID}


@app.get("/api/paintings/<painting_id>")
def get_painting(painting_id: str):
    painting = catalogue().get(painting_id)
    if not painting:
        return jsonify({"error": "Artwork not found."}), 404
    return jsonify(public_painting(painting))


@app.post("/api/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    question = str(payload.get("question", "")).strip()
    painting_id = str(payload.get("painting_id", "")).strip()
    if not question or len(question) > 1_000:
        return jsonify({"error": "Provide a question of up to 1,000 characters."}), 400
    painting = catalogue().get(painting_id)
    if not painting:
        return jsonify({"error": "Artwork not found."}), 404

    passages = retrieve(question, painting)
    if not passages:
        return jsonify({"error": "This artwork has no indexed knowledge sources yet."}), 422
    try:
        answer = generate_answer(question, painting, passages)
    except Exception as error:  # model / network errors should not crash the API
        app.logger.exception("Model generation failed")
        return jsonify({"error": "The guide is temporarily unavailable. Please try again."}), 503
    return jsonify(
        {
            "answer": answer,
            "sources": [{key: item[key] for key in ("id", "title", "url")} for item in passages],
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
