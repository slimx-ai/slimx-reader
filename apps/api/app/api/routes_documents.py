from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, Response, UploadFile
from sqlalchemy import func
from sqlmodel import Session, col, select

from app.api import range_serving
from app.api.document_errors import ErrorCode, reader_error
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models.document import Document
from app.schemas.documents import DocumentContent, DocumentList, DocumentRead
from app.services.document_extraction import is_supported_document
from app.services.documents import create_document
from app.storage import object_keys
from app.storage.local_storage import LocalObjectStorage, StorageObjectMissing, get_storage

router = APIRouter(prefix="/api/documents", tags=["documents"])

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
StorageDep = Annotated[LocalObjectStorage, Depends(get_storage)]

_SORT_COLUMNS = {"created_at", "updated_at", "title", "file_size"}
_UPLOAD_CHUNK = 1024 * 1024


def _load_document(session: Session, document_id: str) -> Document:
    doc = session.get(Document, document_id)
    if doc is None:
        raise reader_error(404, ErrorCode.DOCUMENT_NOT_FOUND, "Document not found.")
    return doc


async def _read_bounded(file: UploadFile, limit: int) -> bytes:
    """Read the upload, refusing to buffer more than ``limit`` bytes."""
    buf = bytearray()
    while True:
        chunk = await file.read(_UPLOAD_CHUNK)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > limit:
            raise reader_error(
                413,
                ErrorCode.FILE_TOO_LARGE,
                "File exceeds the maximum upload size.",
                limit_bytes=limit,
            )
    return bytes(buf)


@router.post("/upload", response_model=DocumentRead, status_code=201)
async def upload_document(
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
    file: UploadFile,
    content_length: Annotated[int | None, Header()] = None,
) -> DocumentRead:
    filename = file.filename or "document"
    if not is_supported_document(filename, file.content_type):
        raise reader_error(
            415,
            ErrorCode.UNSUPPORTED_TYPE,
            "Unsupported document type. Supported: PDF, DOCX, Markdown, TXT, and code/text files.",
        )
    limit = settings.max_document_upload_bytes
    if content_length is not None and content_length > limit:
        raise reader_error(
            413,
            ErrorCode.FILE_TOO_LARGE,
            "File exceeds the maximum upload size.",
            limit_bytes=limit,
        )
    data = await _read_bounded(file, limit)
    if not data:
        raise reader_error(400, ErrorCode.BAD_REQUEST, "Uploaded file is empty.")
    doc = create_document(
        session, storage, filename=filename, mime_type=file.content_type, data=data
    )
    return DocumentRead.from_model(doc)


@router.get("", response_model=DocumentList)
def list_documents(
    session: SessionDep,
    q: str | None = None,
    sort: str = "created_at",
    order: str = "desc",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> DocumentList:
    if sort not in _SORT_COLUMNS:
        sort = "created_at"
    sort_col = getattr(Document, sort)
    stmt = select(Document)
    count_stmt = select(func.count()).select_from(Document)
    if q:
        like = f"%{q}%"
        cond = col(Document.title).ilike(like) | col(Document.filename).ilike(like)
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    stmt = stmt.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
    stmt = stmt.limit(limit).offset(offset)
    items = session.exec(stmt).all()
    total = session.exec(count_stmt).one()
    return DocumentList(
        items=[DocumentRead.from_model(d) for d in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{document_id}", response_model=DocumentRead)
def get_document(session: SessionDep, document_id: str) -> DocumentRead:
    return DocumentRead.from_model(_load_document(session, document_id))


@router.api_route("/{document_id}/file", methods=["GET", "HEAD"])
def get_document_file(
    session: SessionDep,
    storage: StorageDep,
    document_id: str,
    request: Request,
    range: Annotated[str | None, Header()] = None,
) -> Response:
    doc = _load_document(session, document_id)
    try:
        return range_serving.serve_object(
            storage,
            doc.object_key,
            media_type=doc.mime_type or "application/octet-stream",
            range_header=range,
            filename=doc.filename,
            method=request.method,
        )
    except FileNotFoundError as exc:
        raise reader_error(
            404, ErrorCode.STORAGE_ERROR, "The stored file for this document is missing."
        ) from exc


@router.get("/{document_id}/content", response_model=DocumentContent)
def get_document_content(
    session: SessionDep, storage: StorageDep, document_id: str
) -> DocumentContent:
    doc = _load_document(session, document_id)
    if not doc.extracted_text_key:
        return DocumentContent(
            document_id=doc.id, source_type=doc.source_type, text="", available=False
        )
    try:
        text = storage.get_text(doc.extracted_text_key)
    except StorageObjectMissing:
        return DocumentContent(
            document_id=doc.id, source_type=doc.source_type, text="", available=False
        )
    return DocumentContent(
        document_id=doc.id, source_type=doc.source_type, text=text, available=True
    )


@router.delete("/{document_id}", status_code=204)
def delete_document(session: SessionDep, storage: StorageDep, document_id: str) -> Response:
    doc = _load_document(session, document_id)
    # DB-level ON DELETE CASCADE removes annotations, indexing_jobs, and notes; retrieved_chunks
    # are SET NULL. (Best-effort SlimX-RAG index deletion is wired in Phase 3.)
    storage.delete_prefix(object_keys.document_prefix(doc.id))
    session.delete(doc)
    session.commit()
    return Response(status_code=204)
