from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.note import Note, NoteKind


class NoteCreate(BaseModel):
    document_id: str
    kind: str = NoteKind.NOTE
    body: str
    annotation_id: str | None = None
    retrieval_run_id: str | None = None


class NoteUpdate(BaseModel):
    kind: str | None = None
    body: str | None = None


class NoteRead(BaseModel):
    id: str
    document_id: str
    annotation_id: str | None
    retrieval_run_id: str | None
    kind: str
    body: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, note: Note) -> NoteRead:
        return cls(
            id=note.id,
            document_id=note.document_id,
            annotation_id=note.annotation_id,
            retrieval_run_id=note.retrieval_run_id,
            kind=note.kind,
            body=note.body,
            created_at=note.created_at,
            updated_at=note.updated_at,
        )
