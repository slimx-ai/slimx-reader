from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.document import Document


class DocumentRead(BaseModel):
    id: str
    title: str
    filename: str
    mime_type: str | None
    source_type: str | None
    content_hash: str | None
    file_size: int
    page_count: int | None
    status: str
    indexing_status: str
    rag_index_ref: str | None
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, doc: Document) -> DocumentRead:
        return cls(
            id=doc.id,
            title=doc.title,
            filename=doc.filename,
            mime_type=doc.mime_type,
            source_type=doc.source_type,
            content_hash=doc.content_hash,
            file_size=doc.file_size,
            page_count=doc.page_count,
            status=doc.status,
            indexing_status=doc.indexing_status,
            rag_index_ref=doc.rag_index_ref,
            metadata=doc.doc_metadata or {},
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )


class DocumentList(BaseModel):
    items: list[DocumentRead]
    total: int
    limit: int
    offset: int


class DocumentContent(BaseModel):
    document_id: str
    source_type: str | None
    text: str
    available: bool
