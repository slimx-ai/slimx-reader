from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlmodel import Session, select

from app.api.document_errors import ErrorCode, reader_error
from app.db.session import get_session
from app.models.annotation import Annotation
from app.models.base import utcnow
from app.models.document import Document
from app.schemas.annotations import AnnotationCreate, AnnotationRead, AnnotationUpdate

router = APIRouter(tags=["annotations"])

SessionDep = Annotated[Session, Depends(get_session)]


def _load_document(session: Session, document_id: str) -> Document:
    doc = session.get(Document, document_id)
    if doc is None:
        raise reader_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not found.")
    return doc


def _load_annotation(session: Session, annotation_id: str) -> Annotation:
    ann = session.get(Annotation, annotation_id)
    if ann is None:
        raise reader_error(404, ErrorCode.ANNOTATION_NOT_FOUND, "Annotation not found.")
    return ann


@router.get("/api/documents/{document_id}/annotations", response_model=list[AnnotationRead])
def list_annotations(session: SessionDep, document_id: str) -> list[AnnotationRead]:
    _load_document(session, document_id)
    stmt = (
        select(Annotation)
        .where(Annotation.document_id == document_id)
        .order_by(Annotation.created_at.asc())  # type: ignore[attr-defined]
    )
    return [AnnotationRead.from_model(a) for a in session.exec(stmt).all()]


@router.post(
    "/api/documents/{document_id}/annotations", response_model=AnnotationRead, status_code=201
)
def create_annotation(
    session: SessionDep, document_id: str, payload: AnnotationCreate
) -> AnnotationRead:
    _load_document(session, document_id)
    ann = Annotation(
        document_id=document_id,
        type=payload.type,
        quote=payload.quote,
        start_offset=payload.start_offset,
        end_offset=payload.end_offset,
        page=payload.page,
        color=payload.color,
        body=payload.body,
        labels=payload.labels,
        pdf_anchor=payload.pdf_anchor,
    )
    session.add(ann)
    session.commit()
    session.refresh(ann)
    return AnnotationRead.from_model(ann)


@router.patch("/api/annotations/{annotation_id}", response_model=AnnotationRead)
def update_annotation(
    session: SessionDep, annotation_id: str, payload: AnnotationUpdate
) -> AnnotationRead:
    ann = _load_annotation(session, annotation_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(ann, key, value)
    ann.updated_at = utcnow()
    session.add(ann)
    session.commit()
    session.refresh(ann)
    return AnnotationRead.from_model(ann)


@router.delete("/api/annotations/{annotation_id}", status_code=204)
def delete_annotation(session: SessionDep, annotation_id: str) -> Response:
    ann = _load_annotation(session, annotation_id)
    session.delete(ann)
    session.commit()
    return Response(status_code=204)
