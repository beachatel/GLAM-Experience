# Museum Companion

The React app reads artwork metadata from Flask. Questions go to `POST /api/chat`,
where Flask retrieves the most relevant entries in that artwork's JSON knowledge
base and asks `HuggingFaceTB/SmolLM2-135M-Instruct` to answer from that context.

## Run locally

In one terminal:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/app.py
```

In another terminal:

```bash
npm install
npm run dev
```

Vite proxies `/api` calls to Flask on port 5000. The first chat request downloads
the model; this can take a little while. Set `MODEL_ID` before starting Flask to
use a compatible local or Hugging Face model instead.

## Add an artwork and its sources

Add a painting object to `backend/data/paintings.json`. Each `knowledge_base`
entry needs a stable `id`, `title`, and extracted `content`; use `url` to retain
the original webpage or PDF as a visible citation. This makes the exact context
used by the guide explicit and reviewable. The frontend requests an artwork by
its `id`, currently `the-kiss`.

```json
{
  "id": "collection-page",
  "title": "Museum collection page",
  "type": "webpage",
  "url": "https://museum.example/artwork",
  "content": "Reviewed source text to make available to the guide."
}
```
