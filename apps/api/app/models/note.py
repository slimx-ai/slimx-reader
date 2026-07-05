from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlmodel import Field, SQLModel

from app.models.base import new_uuid, utcnow


class NoteKind:
    NOTE = "note"
    EVIDENCE = "evidence"
    SUMMARY = "summary"
    EXPLANATION = "explanation"
    FLASHCARD = "flashcard"


class Note(SQLModel, table=True):
    __tablename__ = "notes"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    document_id: str = Field(
        sa_column=Column(
            String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
        )
    )
    annotation_id: str | None = Field(
        default=None,
        sa_column=Column(String, ForeignKey("annotations.id", ondelete="SET NULL"), nullable=True),
    )
    retrieval_run_id: str | None = Field(
        default=None,
        sa_column=Column(
            String, ForeignKey("retrieval_runs.id", ondelete="SET NULL"), nullable=True
        ),
    )
    kind: str = Field(default=NoteKind.NOTE)
    body: str = ""
    created_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False)
    )
