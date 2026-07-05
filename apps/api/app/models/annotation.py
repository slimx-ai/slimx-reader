from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String
from sqlmodel import Field, SQLModel

from app.models.base import new_uuid, utcnow


class AnnotationType:
    HIGHLIGHT = "highlight"
    COMMENT = "comment"
    ASK_ANCHOR = "ask_anchor"
    AI_NOTE = "ai_note"


class Annotation(SQLModel, table=True):
    __tablename__ = "annotations"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    document_id: str = Field(
        sa_column=Column(
            String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
        )
    )
    type: str = Field(default=AnnotationType.HIGHLIGHT)
    quote: str = ""
    start_offset: int | None = None
    end_offset: int | None = None
    page: int | None = None
    color: str | None = None
    body: str | None = None
    labels: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    # Normalized 0..1 page-space rects captured at selection time, for durable, zoom-independent
    # PDF highlight painting (falls back to quote/offset matching when absent).
    pdf_anchor: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
