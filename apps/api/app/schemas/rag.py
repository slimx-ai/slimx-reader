from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.indexing_job import IndexingJob


class IndexingJobRead(BaseModel):
    id: str
    document_id: str
    status: str
    attempt: int
    error_reason: str | None
    chunk_count: int | None
    embedding_provider: str | None
    embedding_model: str | None
    vector_backend: str | None
    rag_index_ref: str | None
    trace: dict[str, Any] | None
    elapsed_ms: int | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    @classmethod
    def from_model(cls, job: IndexingJob) -> IndexingJobRead:
        return cls(
            id=job.id,
            document_id=job.document_id,
            status=job.status,
            attempt=job.attempt,
            error_reason=job.error_reason,
            chunk_count=job.chunk_count,
            embedding_provider=job.embedding_provider,
            embedding_model=job.embedding_model,
            vector_backend=job.vector_backend,
            rag_index_ref=job.rag_index_ref,
            trace=job.trace_json,
            elapsed_ms=job.elapsed_ms,
            created_at=job.created_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )


class DocumentChunkView(BaseModel):
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


class DocumentChunksResponse(BaseModel):
    document_id: str
    status: str  # ready | not_indexed | unavailable
    chunk_count: int
    chunks: list[DocumentChunkView]


class RagHealthResponse(BaseModel):
    enabled: bool
    url_configured: bool
    adapter_kind: str
    real_available: bool
    fallback_reason: str | None
    service_url: str | None
    vector_backend: str | None
    auth_enabled: bool | None
