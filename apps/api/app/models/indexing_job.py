from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String
from sqlmodel import Field, SQLModel

from app.models.base import new_uuid, utcnow


class IndexingJob(SQLModel, table=True):
    """One document's indexing lifecycle.

    status: uploaded -> extracting -> chunking -> embedding -> indexing -> ready | failed
            (waiting_for_rag when SlimX-RAG is configured but unreachable — auto-heals)
    """

    __tablename__ = "indexing_jobs"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    document_id: str = Field(
        sa_column=Column(
            String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
        )
    )
    status: str = Field(default="uploaded", index=True)
    attempt: int = 0
    error_reason: str | None = None
    error_json: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    chunk_count: int | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    vector_backend: str | None = None
    rag_index_ref: str | None = None
    trace_json: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    heartbeat_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    started_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    finished_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    elapsed_ms: int | None = None
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
