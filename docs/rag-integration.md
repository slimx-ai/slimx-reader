# RAG integration

SlimX Reader uses [SlimX-RAG](https://github.com/slimx-ai/SlimX-RAG) as its knowledge engine.
The reader **never** parses/chunks/embeds/indexes/retrieves on its own — it calls SlimX-RAG
over HTTP through a single `RagAdapter` boundary.

## The adapter boundary

`apps/api/app/services/rag/`:

- `base.py` — the `RagAdapter` Protocol (`health`, `index_file`, `index_document`, `retrieve`,
  `list_document_chunks`, `delete_document`, `set_embedding`).
- `contract.py` — the wire DTOs and the SlimX-RAG endpoint constants.
- `http_rag_adapter.py` — the real adapter (httpx). Redacts secrets from every error.
- `fake_rag_adapter.py` — a deterministic in-memory adapter used for tests and offline dev.
- `factory.py` — `get_rag_adapter(settings)`: returns the real adapter only when
  `READER_ENABLE_RAG` is on, `READER_SLIMX_RAG_URL` is set, **and** a cached `/ready` probe
  succeeds; otherwise the fake. `describe_rag_status()` reports whether real RAG is available.

Routes and the frontend depend only on this boundary.

## SlimX-RAG endpoints used

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/ready` | liveness / deep readiness probe |
| POST | `/api/index/file` | **page-aware** ingest of original bytes (PDF/DOCX/…), preferred |
| POST | `/api/index` | flat-text ingest (fallback when file ingest is unsupported) |
| POST | `/api/retrieve` | hybrid retrieval (dense + BM25 + RRF) with rich citations |
| GET | `/api/documents/{id}/chunks` | inspect what's in the index for a document |
| DELETE | `/api/documents/{id}` | remove a document from the index (idempotent) |
| POST | `/api/admin/embedding` | switch embedding provider/model (resets the index) |

## The `workspace_id = "local"` convention

SlimX-RAG scopes every document by `doc_id = path_id("{workspace_id}/{document_id}")`, so those
two fields are required on ingest/retrieve/chunks/delete. SlimX Reader is single-user, so it
passes a **constant `workspace_id = "local"`** at the adapter boundary and never surfaces
workspaces in the API or UI. This keeps SlimX-RAG completely unmodified. (Only SlimX-RAG's
`local` backend supports scope-filtered hybrid retrieval, which is exactly the single-user case.)

## Page-aware indexing

For PDF/DOCX/Markdown, the reader sends the **original bytes** to `/api/index/file` so page and
section structure survive into retrieval — citations come back as `[Title, p. 67, Section]`. It
only falls back to text indexing (`/api/index`) when file ingest is unsupported and extracted
text exists.

## Indexing lifecycle

An upload enqueues an `IndexingJob`. A background worker advances it:

```
uploaded → extracting → chunking → embedding → indexing → ready
                                                        ↘ failed
(waiting_for_rag when SlimX-RAG is configured but unreachable — auto-heals)
```

A document's retrieval-ready terminal status is **`ready`**. If a PDF has no extractable text,
the job fails with `no_extractable_text` and the UI explains it may be scanned/image-only (OCR
is future work) — the reader never fabricates an ungrounded answer.

## Retrieval transparency

Every `POST /api/rag/retrieve` / `POST /api/rag/ask` persists a `RetrievalRun` plus one
`RetrievedChunk` per kept chunk (rank, score, page, section, offsets). The UI shows the answer,
the **context used** (chunks, top-k, min-score, chars, embedding provider/model, vector backend,
latency), and the **citations** — so you can always see exactly what grounded the answer.

## Running SlimX-RAG locally

```bash
docker compose -f docker-compose.rag.yml up      # SlimX-RAG on :8080 (hf MiniLM embeddings, local backend)
./scripts/check-rag.sh                            # verify it's ready
```

See [local-models.md](local-models.md) for models and [privacy.md](privacy.md) for the egress rules.
