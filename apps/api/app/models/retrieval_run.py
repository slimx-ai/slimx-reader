from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String
from sqlmodel import Field, SQLModel

from app.models.base import new_uuid, utcnow


class RetrievalStatus:
    STARTED = "started"
    SUCCEEDED = "succeeded"
    INSUFFICIENT_CONTEXT = "insufficient_context"
    FAILED = "failed"


class RetrievalRun(SQLModel, table=True):
    __tablename__ = "retrieval_runs"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    question: str
    document_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    top_k: int = 8
    min_score: float = 0.0
    status: str = Field(default=RetrievalStatus.STARTED, index=True)
    elapsed_ms: int | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    vector_backend: str | None = None
    answer: str | None = None
    model_ref: str | None = None
    trace_json: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    context_snapshot: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    error_json: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    finished_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))


class RetrievedChunk(SQLModel, table=True):
    __tablename__ = "retrieved_chunks"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    retrieval_run_id: str = Field(
        sa_column=Column(
            String,
            ForeignKey("retrieval_runs.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    document_id: str | None = Field(
        default=None,
        sa_column=Column(String, ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
    )
    rag_chunk_id: str | None = None
    rank: int = 0
    score: float = 0.0
    text: str = ""
    page: int | None = None
    section: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    chunk_metadata: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
