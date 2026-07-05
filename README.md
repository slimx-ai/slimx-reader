<div align="center">

# SlimX Reader

**A local-first intelligent PDF & document reader for students, researchers, and developers.**

Read, highlight, comment, ask questions, inspect retrieved chunks, and save evidence —
powered by [SlimX](https://github.com/slimx-ai/slimx) for model execution and
[SlimX-RAG](https://github.com/slimx-ai/SlimX-RAG) for indexing, retrieval, and citations.

</div>

> **Status:** v0.1 in active development. This README is filled in as the phases land.
> Screenshots are placeholders (marked _TODO_) until the UI is captured.

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

> Full setup (with SlimX-RAG + Ollama) lands in Phase 5. Minimal dev loop:

```bash
# Backend (FastAPI, :8000)
cd apps/api && python -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload --port 8000

# Frontend (Next.js, :3000) — in another terminal
cd apps/web && npm install && npm run dev
```

Open http://localhost:3000. To enable indexing and grounded Q&A, start SlimX-RAG
(`docker compose -f docker-compose.rag.yml up`) and Ollama — see
[docs/local-models.md](docs/local-models.md).

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
