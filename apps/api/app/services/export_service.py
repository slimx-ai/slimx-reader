"""Export a document's annotations, notes, and citations to Markdown or JSON."""

from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.models.annotation import Annotation, AnnotationType
from app.models.document import Document
from app.models.note import Note


def _annotations(session: Session, document_id: str) -> list[Annotation]:
    stmt = (
        select(Annotation)
        .where(Annotation.document_id == document_id)
        .order_by(Annotation.created_at.asc())  # type: ignore[attr-defined]
    )
    return list(session.exec(stmt).all())


def _notes(session: Session, document_id: str) -> list[Note]:
    stmt = (
        select(Note).where(Note.document_id == document_id).order_by(Note.created_at.asc())  # type: ignore[attr-defined]
    )
    return list(session.exec(stmt).all())


def build_json(session: Session, document: Document) -> dict[str, Any]:
    annotations = _annotations(session, document.id)
    notes = _notes(session, document.id)
    return {
        "document": {
            "id": document.id,
            "title": document.title,
            "filename": document.filename,
            "source_type": document.source_type,
            "page_count": document.page_count,
            "indexing_status": document.indexing_status,
        },
        "annotations": [
            {
                "type": a.type,
                "quote": a.quote,
                "body": a.body,
                "page": a.page,
                "labels": a.labels,
                "created_at": a.created_at.isoformat(),
            }
            for a in annotations
        ],
        "notes": [
            {
                "kind": n.kind,
                "body": n.body,
                "grounded": n.retrieval_run_id is not None,
                "created_at": n.created_at.isoformat(),
            }
            for n in notes
        ],
    }


def build_markdown(session: Session, document: Document) -> str:
    annotations = _annotations(session, document.id)
    notes = _notes(session, document.id)
    lines: list[str] = [f"# {document.title}", ""]
    lines.append(f"_Source: {document.filename}_")
    if document.page_count:
        lines.append(f"_Pages: {document.page_count}_")
    lines.append("")

    highlights = [a for a in annotations if a.type == AnnotationType.HIGHLIGHT]
    comments = [a for a in annotations if a.type == AnnotationType.COMMENT]

    if highlights:
        lines.append("## Highlights")
        lines.append("")
        for a in highlights:
            page = f" (p. {a.page})" if a.page else ""
            lines.append(f"> {a.quote}{page}")
            lines.append("")

    if comments:
        lines.append("## Comments")
        lines.append("")
        for a in comments:
            page = f" (p. {a.page})" if a.page else ""
            lines.append(f"> {a.quote}{page}")
            if a.body:
                lines.append(f"\n{a.body}")
            lines.append("")

    if notes:
        lines.append("## Notes & evidence")
        lines.append("")
        for n in notes:
            tag = "Evidence" if n.kind == "evidence" else n.kind.capitalize()
            grounded = " · grounded" if n.retrieval_run_id else ""
            lines.append(f"**{tag}{grounded}**")
            lines.append("")
            lines.append(n.body)
            lines.append("")

    if not (highlights or comments or notes):
        lines.append("_No annotations or notes yet._")

    return "\n".join(lines).rstrip() + "\n"
