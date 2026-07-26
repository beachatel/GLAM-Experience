import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function Icon({ name }) {
  const paths = {
    home: (
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Zm6 11v-6h6v6" />
    ),
    scan: (
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 8h8v8H8z" />
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Scanner({ onFound }) {
  const video = useRef(null);
  const controls = useRef(null);
  const found = useRef(false);
  const [state, setState] = useState("idle");
  const [manualCode, setManualCode] = useState("");

  const stopCamera = () => {
    controls.current?.stop();
    controls.current = null;
    video.current?.srcObject?.getTracks().forEach((track) => track.stop());
  };

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    stopCamera();
    found.current = false;
    try {
      setState("scanning");
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      controls.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        video.current,
        (result) => {
          if (result && !found.current) {
            found.current = true;
            const code = result.getText();
            setState("found");
            setTimeout(() => {
              stopCamera();
              onFound(code);
            }, 0);
          }
        },
      );
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        setState("denied");
      } else {
        setState("unavailable");
      }
    }
  }

  const cameraMessage = {
    unsupported:
      "This browser does not support camera access. Enter the artwork code below.",
    denied:
      "Camera access was not granted. Check browser permissions, then try again.",
    unavailable:
      "We could not open a camera. Check that no other app is using it, then try again.",
  }[state];

  return (
    <section className="page-card scanner">
      <p className="eyebrow"></p>
      <h1>Scan a QR code</h1>
      <p>
        Point your camera at an artwork QR code. You can also enter its code
        manually.
      </p>
      <video
        ref={video}
        muted
        playsInline
        className={state === "scanning" || state === "found" ? "visible" : ""}
      />
      {state !== "scanning" && state !== "found" && (
        <button className="primary" onClick={startCamera}>
          Open camera
        </button>
      )}
      {cameraMessage && <p className="hint">{cameraMessage}</p>}
      <form
        className="manual-code"
        onSubmit={(event) => {
          event.preventDefault();
          onFound(manualCode);
        }}
      >
        <input
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value)}
          placeholder="Artwork code, e.g. the-kiss"
          aria-label="Artwork code"
        />
        <button className="primary">Open</button>
      </form>
    </section>
  );
}

function App() {
  const [page, setPage] = useState("scan");
  const [painting, setPainting] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);
  const [scanError, setScanError] = useState("");

  const loadPainting = async (id) => {
    const cleanId = id
      .trim()
      .replace(/^painting:\/\//, "")
      .split("/")
      .filter(Boolean)
      .pop();
    const response = await fetch(
      `/api/paintings/${encodeURIComponent(cleanId)}`,
    );
    if (!response.ok)
      throw new Error("That QR code does not match an artwork in this museum.");
    setPainting(await response.json());
    setMessages([]);
    setPage("artwork");
    setScanError("");
  };
  const ask = async (value = question) => {
    const text = value.trim();
    if (!text || asking || !painting) return;
    setMessages((current) => [...current, { author: "you", text }]);
    setQuestion("");
    setAsking(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ painting_id: painting.id, question: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessages((current) => [
        ...current,
        { author: "guide", text: data.answer, sources: data.sources },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { author: "guide error", text: error.message },
      ]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <p>{painting?.museum || "temp project name__"}</p>
        <nav aria-label="App navigation">
          <button
            className={page === "artwork" && painting ? "active" : ""}
            onClick={() => setPage(painting ? "artwork" : "scan")}
            aria-label="Artwork"
          >
            <Icon name="home" />
          </button>
          <button
            className={page === "scan" ? "active" : ""}
            onClick={() => setPage("scan")}
            aria-label="Scan QR code"
          >
            <Icon name="scan" />
          </button>
          <button
            className={page === "about" ? "active" : ""}
            onClick={() => setPage("about")}
            aria-label="About the app"
          >
            <Icon name="info" />
          </button>
        </nav>
      </header>
      {page === "scan" && (
        <>
          <Scanner
            onFound={(code) =>
              loadPainting(code).catch((error) => setScanError(error.message))
            }
          />
          {scanError && <p className="notice">{scanError}</p>}
        </>
      )}
      {page === "about" && (
        <section className="page-card">
          <p className="eyebrow">About</p>
          <h1>Personalised answers to your questions</h1>
          <p>
            temp name__ pairs each artifact with a small, curated knowledge
            base. Ask questions to explore the work at your own pace.
          </p>
          <p>
            Answers are generated from the sources chosen by the curators of the
            exhibition, and source links appear below each reply.
          </p>
        </section>
      )}
      {page === "artwork" && painting && (
        <>
          <section className="hero">
            <img
              src={painting.image}
              alt={`${painting.title} by ${painting.artist}`}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </section>
          <section className="artwork-info">
            <h1>{painting.title}</h1>
            <p className="artist">
              {painting.artist} <span>·</span> {painting.date}
            </p>
            <div className="details-grid">
              <div>
                <span>Medium</span>
                <p>{painting.medium}</p>
              </div>
              <div>
                <span>Location</span>
                <p>{painting.museum}</p>
              </div>
              <div>
                <span>Movement</span>
                <p>{painting.movement}</p>
              </div>
              <div>
                <span>Dimensions</span>
                <p>{painting.dimensions}</p>
              </div>
            </div>
          </section>
          <section className="conversation">
            <h2>Personalised answers to your questions</h2>
            <p className="intro">
              Ask about the symbols, materials, or story behind this work.
            </p>
            {messages.length === 0 ? (
              <div className="prompts">
                {painting.prompts.map((prompt) => (
                  <button key={prompt} onClick={() => ask(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="messages" aria-live="polite">
                {messages.map((message, index) => (
                  <div key={index} className={message.author}>
                    <p>{message.text}</p>
                    {message.sources?.length > 0 && (
                      <small>
                        Sources:{" "}
                        {message.sources.map((source) =>
                          source.url ? (
                            <a
                              key={source.title}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source.title}
                            </a>
                          ) : (
                            <span key={source.title}>{source.title}</span>
                          ),
                        )}
                      </small>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={asking}
              placeholder={
                asking ? "Your guide is thinking…" : "Ask about this artwork"
              }
            />
            <button
              className={question.trim() && !asking ? "ready" : ""}
              disabled={asking}
            >
              ↑
            </button>
          </form>
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
