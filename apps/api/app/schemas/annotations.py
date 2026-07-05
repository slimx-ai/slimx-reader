from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.annotation import Annotation, AnnotationType


class AnnotationCreate(BaseModel):
    type: str = AnnotationType.HIGHLIGHT
    quote: str = ""
    start_offset: int | None = None
    end_offset: int | None = None
    page: int | None = None
    color: str | None = None
    body: str | None = None
    labels: list[str] = Field(default_factory=list)
    pdf_anchor: dict[str, Any] | None = None


class AnnotationUpdate(BaseModel):
    type: str | None = None
    quote: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None
    page: int | None = None
    color: str | None = None
    body: str | None = None
    labels: list[str] | None = None
    pdf_anchor: dict[str, Any] | None = None


class AnnotationRead(BaseModel):
    id: str
    document_id: str
    type: str
    quote: str
    start_offset: int | None
    end_offset: int | None
    page: int | None
    color: str | None
    body: str | None
    labels: list[str]
    pdf_anchor: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, ann: Annotation) -> AnnotationRead:
        return cls(
            id=ann.id,
            document_id=ann.document_id,
            type=ann.type,
            quote=ann.quote,
            start_offset=ann.start_offset,
            end_offset=ann.end_offset,
            page=ann.page,
            color=ann.color,
            body=ann.body,
            labels=ann.labels or [],
            pdf_anchor=ann.pdf_anchor,
            created_at=ann.created_at,
            updated_at=ann.updated_at,
        )
