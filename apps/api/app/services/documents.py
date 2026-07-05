from __future__ import annotations

import hashlib

from sqlmodel import Session

from app.models.base import utcnow
from app.models.document import Document, DocumentStatus
from app.services.document_extraction import (
    DocumentExtractionError,
    count_pdf_pages,
    detect_source_type,
    extract_text,
)
from app.storage import object_keys
from app.storage.local_storage import LocalObjectStorage


def create_document(
    session: Session,
    storage: LocalObjectStorage,
    *,
    filename: str,
    mime_type: str | None,
    data: bytes,
    title: str | None = None,
) -> Document:
    """Persist an uploaded document: store bytes, best-effort extract text + page count.

    Extraction runs at upload so non-PDF documents render immediately and PDFs get a page
    count. Indexing (Phase 3) is separate and preferentially sends original bytes to SlimX-RAG.
    """
    source_type = detect_source_type(filename, mime_type)
    content_hash = hashlib.sha256(data).hexdigest()

    doc = Document(
        title=title or filename,
        filename=filename,
        mime_type=mime_type,
        source_type=source_type,
        object_key="pending",
        content_hash=content_hash,
        file_size=len(data),
        status=DocumentStatus.UPLOADING,
    )
    session.add(doc)
    session.flush()  # assign doc.id

    original_key = object_keys.document_original_key(doc.id, filename)
    storage.put_bytes(original_key, data)
    doc.object_key = original_key

    if source_type == "pdf":
        doc.page_count = count_pdf_pages(data)

    # Best-effort text extraction — a failure here (e.g. scanned PDF) never blocks the upload;
    # the document still opens and indexing will report a precise reason later.
    try:
        _, text = extract_text(filename, mime_type, data)
    except DocumentExtractionError:
        text = ""
    if text.strip():
        text_key = object_keys.document_extracted_text_key(doc.id)
        storage.put_text(text_key, text)
        doc.extracted_text_key = text_key
        doc.status = DocumentStatus.PARSED
    else:
        doc.status = DocumentStatus.UPLOADED

    doc.updated_at = utcnow()
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return doc
