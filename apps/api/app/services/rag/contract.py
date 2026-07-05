"""SlimX-RAG HTTP contract — DTOs and endpoint constants.

Isolates the external SlimX-RAG service contract (ported from SlimX-AI ControlRoom, MIT). The
endpoint paths and JSON shapes are confirmed against the SlimX-RAG FastAPI server
(``slimx-ai/SlimX-RAG``, ``src/slimx_rag/server/app.py``, default port 8080):

- ``GET /health`` (liveness) / ``GET /ready`` (deep readiness: index dir writable, embedder loads,
  no dim mismatch). ``HttpRagAdapter.health`` prefers ``/ready``, falls back to ``/health`` on 404.
- ``POST /api/retrieve`` — hybrid retrieval, scoped by ``workspace_id`` (+ optional documents).
- ``POST /api/index`` — flat-text ingest; ``POST /api/index/file`` — page-aware ingest of raw bytes.
- ``GET /api/documents/{id}/chunks?workspace_id=`` — list one document's indexed chunks.
- ``DELETE /api/documents/{id}?workspace_id=`` — remove one document (idempotent).
- ``POST /api/admin/embedding`` — switch embedding provider/model (resets the index).

SlimX-RAG scopes each document by ``doc_id = path_id("{workspace_id}/{document_id}")``; SlimX Reader
passes the constant ``workspace_id="local"`` at the HTTP adapter boundary (see core/config.py).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class Endpoints:
    HEALTH = "/health"
    READY = "/ready"
    RETRIEVE = "/api/retrieve"
    ASK = "/api/ask"
    CONFIG = "/api/config"
    INDEX = "/api/index"
    INDEX_FILE = "/api/index/file"
    SET_EMBEDDING = "/api/admin/embedding"

    @staticmethod
    def document_chunks(document_id: str) -> str:
        return f"/api/documents/{document_id}/chunks"

    @staticmethod
    def document(document_id: str) -> str:
        return f"/api/documents/{document_id}"


class RagHealth(BaseModel):
    ok: bool
    version: str | None = None
    vector_backend: str | None = None
    detail: str | None = None
    auth_enabled: bool | None = None


class IndexResult(BaseModel):
    document_id: str
    rag_index_ref: str | None = None
    chunk_count: int = 0
    embedding_provider: str | None = None
    embedding_model: str | None = None
    vector_backend: str | None = None
    status: str = "ready"
    # Richer diagnostics from the page-aware file-indexing path (optional for the text path).
    parser: str | None = None
    parser_version: str | None = None
    source_type: str | None = None
    page_count: int | None = None
    element_count: int | None = None
    parent_count: int | None = None
    embedding_dim: int | None = None
    embedding_max_seq_len: int | None = None
    warnings: list[str] = Field(default_factory=list)
    timings_ms: dict[str, int] = Field(default_factory=dict)


class RetrievedChunk(BaseModel):
    rag_chunk_id: str
    text: str
    score: float = 0.0
    document_id: str | None = None
    page: int | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    vector_backend: str | None = None
    citation: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrieveResult(BaseModel):
    chunks: list[RetrievedChunk] = Field(default_factory=list)
    elapsed_ms: int | None = None
    vector_backend: str | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    insufficient_context: bool = False
    trace: dict[str, Any] | None = None


class DocumentChunkRef(BaseModel):
    """One indexed chunk of a document, for the chunk inspector (no retrieval score)."""

    rag_chunk_id: str
    ordinal: int
    text: str
    page: int | None = None
    section: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    section_path: list[str] | None = None
    parent_id: str | None = None
    page_type: str | None = None
    token_count: int | None = None


class EmbeddingConfig(BaseModel):
    provider: str | None = None
    model: str | None = None
    hf_model: str | None = None
    dim: int | None = None
    device: str | None = None


class SetEmbeddingResult(BaseModel):
    embedding_provider: str | None = None
    embedding_model: str | None = None
    embedding_device: str | None = None
    dim: int | None = None
    index_reset: bool = False


class DeleteResult(BaseModel):
    """Outcome of removing one document. ``ok=False`` only when the service errored — deletion is
    best-effort (the SQLite row is source of truth). An unknown document is ok=True, 0 chunks."""

    ok: bool = False
    deleted_chunks: int = 0
