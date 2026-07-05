from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime
from sqlmodel import Field, SQLModel

from app.models.base import new_uuid, utcnow


class DocumentIndexingStatus:
    """Single source of truth for a document's RAG indexing status.

    IMPORTANT: the retrieval-ready terminal status is ``ready`` (NOT ``indexed``). Filtering
    documents by ``indexed`` silently returns nothing and breaks RAG. (Lesson ported from
    ControlRoom, where a document-type KnowledgeObject uses ``indexed`` but a Document does not.)
    """

    NOT_INDEXED = "not_indexed"
    UPLOADED = "uploaded"
    WAITING_FOR_RAG = "waiting_for_rag"
    EXTRACTING = "extracting"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    INDEXING = "indexing"
    READY = "ready"
    FAILED = "failed"

    RETRIEVABLE = READY
    IN_FLIGHT = frozenset({EXTRACTING, CHUNKING, EMBEDDING, INDEXING})


class DocumentStatus:
    """Lifecycle of the stored file itself, distinct from indexing_status."""

    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    PARSED = "parsed"
    FAILED = "failed"
    MISSING = "missing"


class Document(SQLModel, table=True):
    __tablename__ = "documents"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    title: str
    filename: str
    mime_type: str | None = None
    source_type: str | None = None  # pdf | docx | markdown | code | text
    object_key: str  # local storage key for the original bytes
    extracted_text_key: str | None = None
    content_hash: str | None = None
    file_size: int = 0
    page_count: int | None = None
    status: str = Field(default=DocumentStatus.UPLOADED, index=True)
    indexing_status: str = Field(default=DocumentIndexingStatus.NOT_INDEXED, index=True)
    rag_index_ref: str | None = None
    doc_metadata: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column("metadata", JSON, nullable=False)
    )
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
