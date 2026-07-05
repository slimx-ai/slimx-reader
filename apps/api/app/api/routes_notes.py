from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlmodel import Session, select

from app.api.document_errors import ErrorCode, reader_error
from app.db.session import get_session
from app.models.base import utcnow
from app.models.document import Document
from app.models.note import Note
from app.schemas.notes import NoteCreate, NoteRead, NoteUpdate

router = APIRouter(tags=["notes"])

SessionDep = Annotated[Session, Depends(get_session)]


def _load_note(session: Session, note_id: str) -> Note:
    note = session.get(Note, note_id)
    if note is None:
        raise reader_error(404, ErrorCode.NOTE_NOT_FOUND, "Note not found.")
    return note


@router.post("/api/notes", response_model=NoteRead, status_code=201)
def create_note(session: SessionDep, payload: NoteCreate) -> NoteRead:
    if session.get(Document, payload.document_id) is None:
        raise reader_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not found.")
    note = Note(
        document_id=payload.document_id,
        kind=payload.kind,
        body=payload.body,
        annotation_id=payload.annotation_id,
        retrieval_run_id=payload.retrieval_run_id,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return NoteRead.from_model(note)


@router.get("/api/documents/{document_id}/notes", response_model=list[NoteRead])
def list_notes(session: SessionDep, document_id: str) -> list[NoteRead]:
    if session.get(Document, document_id) is None:
        raise reader_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not found.")
    stmt = (
        select(Note).where(Note.document_id == document_id).order_by(Note.created_at.desc())  # type: ignore[attr-defined]
    )
    return [NoteRead.from_model(n) for n in session.exec(stmt).all()]


@router.patch("/api/notes/{note_id}", response_model=NoteRead)
def update_note(session: SessionDep, note_id: str, payload: NoteUpdate) -> NoteRead:
    note = _load_note(session, note_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(note, key, value)
    note.updated_at = utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    return NoteRead.from_model(note)


@router.delete("/api/notes/{note_id}", status_code=204)
def delete_note(session: SessionDep, note_id: str) -> Response:
    note = _load_note(session, note_id)
    session.delete(note)
    session.commit()
    return Response(status_code=204)
