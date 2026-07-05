# Architecture

SlimX Reader is a small two-app project (a Next.js web UI and a FastAPI local API) that
orchestrates two SlimX ecosystem services: **SlimX-RAG** (knowledge engine) and **SlimX**
(model execution).

## Runtime shape

```
Next.js Reader Web (:3000)
  → SlimX Reader API  (FastAPI, :8000)
      → SQLite metadata         (data/reader.db)
      → local file storage      (data/documents/, data/exports/)
      → RagAdapter → SlimX-RAG service (:8080)     [READER_ENABLE_RAG + READER_SLIMX_RAG_URL]
      → SlimX model client → Ollama (:11434) / oai / cloud (opt-in)
```

There is **no Postgres and no object store** — SQLite plus the local filesystem keep the app
trivially runnable. Multi-tenant concepts (workspaces, projects, auth) are intentionally absent
in v0.1; IDs are UUID strings so a workspace layer can be added later without a rewrite.

## Layering (strict)

- `apps/web` — reading UX, annotation overlay, library, RAG inspection, export. Calls only the
  Reader API. Never talks to SlimX-RAG directly.
- `apps/api/app/api/routes_*.py` — **thin** routes: validate shape, resolve records, enforce the
  cloud-egress gate, call a service, return structured responses.
- `apps/api/app/services/` — application behavior (document extraction, indexing lifecycle,
  retrieval/QA, model client, export).
- `apps/api/app/services/rag/` — the **only** boundary that talks to SlimX-RAG, via a
  `RagAdapter` protocol (`http` real adapter + `fake` deterministic adapter for tests/offline).
- `apps/api/app/services/slimx_client.py` — the **only** place that calls SlimX for generation.

## Storage

- **SQLite** (`data/reader.db`) holds metadata: documents, annotations, indexing jobs, retrieval
  runs, retrieved chunks, notes.
- **Local filesystem** (`data/documents/{document_id}/…`) holds original bytes and extracted text;
  `data/exports/` holds generated export files.
- **SlimX-RAG** owns the vector index (its own `local` JSONL backend by default).

## Request flows

- **Read a PDF:** the viewer streams bytes from `GET /api/documents/{id}/file` using HTTP range
  requests (page 1 renders before the whole file downloads).
- **Index:** upload enqueues an `IndexingJob`; a background worker runs
  `uploaded → extracting → chunking → embedding → indexing → ready`, preferring SlimX-RAG's
  page-aware `/api/index/file`. If SlimX-RAG is unreachable the job parks as `waiting_for_rag`.
- **Ask:** `POST /api/rag/ask` retrieves chunks from SlimX-RAG, packs them under a token budget
  into a grounded prompt, and (optionally) calls SlimX for a cited answer. Every retrieval is
  persisted as a `RetrievalRun` with its `RetrievedChunk`s so the UI can show exactly what was used.

See [rag-integration.md](rag-integration.md), [local-models.md](local-models.md), and
[privacy.md](privacy.md) for the details of each boundary.
