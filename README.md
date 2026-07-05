<div align="center">

# SlimX Reader

**A local-first intelligent PDF & document reader for students, researchers, and developers.**

Read, highlight, comment, ask questions, inspect retrieved chunks, and save evidence —
powered by [SlimX](https://github.com/slimx-ai/slimx) for model execution and
[SlimX-RAG](https://github.com/slimx-ai/SlimX-RAG) for indexing, retrieval, and citations.

</div>

> **Status:** v0.1. Screenshots are placeholders (marked _TODO_) until the UI is captured.

<!-- TODO(screenshot): library + reader with a PDF, a highlight, and a grounded answer with citations. -->
_TODO: screenshots — the reading canvas, the selection toolbar, and a grounded answer with its
"context used" panel and citations._

---

## What it is

SlimX Reader is **not** "chat with your PDF." It is an **evidence-first reading environment**:

- Open or upload a **PDF, DOCX, Markdown, TXT, or code** file into a clean reader.
- Get a professional PDF experience — zoom, page navigation, search, long-PDF support,
  and a **local PDF.js worker** (no CDN).
- **Select → highlight, comment, ask, copy.** Annotations persist across reloads.
- **Index** a document with SlimX-RAG and **ask questions** grounded in retrieved chunks,
  with visible **page/section citations**.
- **Inspect** the retrieved context and **save** useful chunks or answers as evidence/notes.
- **Export** your notes, highlights, comments, and citations to Markdown or JSON.
- Everything works **locally by default** with Ollama/local models. Cloud is opt-in.

## Why local-first

Your documents and reading are yours. SlimX Reader runs entirely on your machine:
SQLite for metadata, the local filesystem for files, SlimX-RAG as a local service, and
Ollama (or any OpenAI-compatible local server) for models. There is **no telemetry**, and
**no data leaves your machine unless you explicitly enable a cloud provider**. See
[docs/privacy.md](docs/privacy.md).

## How it uses SlimX and SlimX-RAG

SlimX Reader owns the **product experience**; the SlimX ecosystem owns the hard parts:

| Layer | Owner | Responsibility |
|---|---|---|
| Reading, annotation, library, RAG inspection, export | **SlimX Reader** | UX + local persistence |
| Document parsing, chunking, embedding, indexing, retrieval, citations | **SlimX-RAG** | knowledge engine (HTTP service) |
| Model execution (Ollama / OpenAI-compatible / optional cloud) | **SlimX** | provider-agnostic LLM calls |

The reader never reimplements RAG or model plumbing. The frontend calls the Reader API;
the Reader API calls SlimX-RAG through a `RagAdapter` boundary and SlimX through a thin
model client. See [docs/architecture.md](docs/architecture.md) and
[docs/rag-integration.md](docs/rag-integration.md).

## Quick start

**One command (bootstraps the venv + npm deps, runs API on :8000 and web on :3000):**

```bash
cp .env.example .env
./scripts/dev.sh
```

Open http://localhost:3000. You can already **read and annotate** documents — indexing and Q&A
light up once SlimX-RAG (and a model) are running.

**Enable indexing + grounded Q&A:**

```bash
# 1. Start SlimX-RAG (offline hf embeddings + local vector backend) on :8080
docker compose -f docker-compose.rag.yml up
./scripts/check-rag.sh          # verify it's ready

# 2. Start a local model for answers (Ollama)
ollama serve
ollama pull llama3.2:3b         # or set READER_DEFAULT_MODEL to a model you have
```

**Or run the whole stack in Docker:**

```bash
docker compose up --build       # web + API + SlimX-RAG
```

### Index a document and ask a question

1. Drop a **PDF / DOCX / Markdown / TXT / code** file onto the library (or click to choose).
2. Open it — PDFs render in the viewer; text/markdown render inline.
3. Select text to **Highlight**, **Comment**, or **Copy**. Annotations persist across reloads.
4. Click **Index** (top bar). Watch the status go `uploaded → … → ready`; inspect the produced
   chunks in the **Chunks** tab.
5. In the **Ask** tab, ask a question. You get a grounded answer with a **context-used** panel and
   **citations** (page/section). Save a chunk as **evidence** or the answer as a **note**.
6. Export your annotations, notes, and citations from the **Info** tab (Markdown or JSON).

Manual dev without Docker (two terminals) is also fine — see
[docs/local-models.md](docs/local-models.md) and [docs/rag-integration.md](docs/rag-integration.md).

## Known limitations (v0.1)

- OCR for scanned/image-only PDFs is not included (they surface a clear message, never a
  fabricated answer).
- Annotations are app-level overlays; exporting them back into the PDF itself is future work.
- Cloud models are optional and **disabled by default**.
- No multi-user/team mode; no agents, MCP, or web search.

See [docs/roadmap.md](docs/roadmap.md) for what's next.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the
[good first issues](https://github.com/slimx-ai/slimx-reader/labels/good%20first%20issue).

## License

[MIT](LICENSE) © 2026 SlimX. SlimX and SlimX-RAG are also MIT-licensed.
