from __future__ import annotations

import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlmodel import Session

from app.api.document_errors import ErrorCode, reader_error
from app.db.session import get_session
from app.models.document import Document
from app.services.export_service import build_json, build_markdown

router = APIRouter(prefix="/api/export", tags=["export"])

SessionDep = Annotated[Session, Depends(get_session)]


def _basename(title: str) -> str:
    # Drop any file extension from the title, then sanitize, so we don't produce "paper.md.md".
    base = re.sub(r"\.[A-Za-z0-9]{1,8}$", "", title)
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")[:120] or "export"


class ExportRequest(BaseModel):
    document_id: str


def _load(session: Session, document_id: str) -> Document:
    doc = session.get(Document, document_id)
    if doc is None:
        raise reader_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not found.")
    return doc


@router.post("/markdown")
def export_markdown(session: SessionDep, payload: ExportRequest) -> Response:
    doc = _load(session, payload.document_id)
    body = build_markdown(session, doc)
    filename = f"{_basename(doc.title)}.md"
    return Response(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/json")
def export_json(session: SessionDep, payload: ExportRequest) -> Response:
    doc = _load(session, payload.document_id)
    body = json.dumps(build_json(session, doc), indent=2, ensure_ascii=False)
    filename = f"{_basename(doc.title)}.json"
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
