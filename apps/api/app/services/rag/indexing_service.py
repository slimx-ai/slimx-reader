"""Document indexing lifecycle.

Adapted from SlimX-AI ControlRoom's indexing_service.py (MIT), simplified for a single-process,
single-user SQLite app (no workspace, no Postgres row locking, no knowledge/audit layer).

    uploaded -> extracting -> chunking -> embedding -> indexing -> ready | failed
    (waiting_for_rag when SlimX-RAG is configured but unreachable — auto-heals)

Ingest prefers SlimX-RAG's page-aware ``/api/index/file`` (raw bytes) and falls back to flat-text
``/api/index`` only when file ingest is unsupported. A PDF with no extractable text fails with
``no_extractable_text`` rather than producing an ungrounded index.
"""

from __future__ import annotations

import time
from datetime import timedelta

from sqlmodel import Session, select

from app.core.config import Settings, get_settings
from app.core.privacy import rag_egress_block_detail
from app.core.redaction import redact_sensitive
from app.models.base import utcnow
from app.models.document import Document, DocumentIndexingStatus, DocumentStatus
from app.models.indexing_job import IndexingJob
from app.services.rag.base import RagAdapter
from app.services.rag.contract import IndexResult
from app.services.rag.errors import RagRequestError, RagUnavailable
from app.services.rag.factory import describe_rag_status, get_rag_adapter
from app.storage.local_storage import LocalObjectStorage, StorageObjectMissing, get_storage

_IN_FLIGHT = {
    DocumentIndexingStatus.EXTRACTING,
    DocumentIndexingStatus.CHUNKING,
    DocumentIndexingStatus.EMBEDDING,
    DocumentIndexingStatus.INDEXING,
}
_CLAIMABLE = (DocumentIndexingStatus.UPLOADED, DocumentIndexingStatus.WAITING_FOR_RAG)
_ACTIVE = {DocumentIndexingStatus.UPLOADED, DocumentIndexingStatus.WAITING_FOR_RAG, *_IN_FLIGHT}
_MAX_ATTEMPTS = 3


# --- Queue management -------------------------------------------------------------


def latest_job_for_document(session: Session, document_id: str) -> IndexingJob | None:
    stmt = (
        select(IndexingJob)
        .where(IndexingJob.document_id == document_id)
        .order_by(IndexingJob.created_at.desc())  # type: ignore[attr-defined]
        .limit(1)
    )
    return session.exec(stmt).first()


def active_job_for_document(session: Session, document_id: str) -> IndexingJob | None:
    job = latest_job_for_document(session, document_id)
    return job if job and job.status in _ACTIVE else None


def enqueue_index(session: Session, *, document: Document) -> IndexingJob:
    """Create a job (idempotent: reuse an active one) and mark the document queued."""
    existing = active_job_for_document(session, document.id)
    if existing is not None:
        return existing
    job = IndexingJob(document_id=document.id, status=DocumentIndexingStatus.UPLOADED)
    document.indexing_status = DocumentIndexingStatus.UPLOADED
    document.updated_at = utcnow()
    session.add(job)
    session.add(document)
    session.commit()
    session.refresh(job)
    return job


def claim_next_job(session: Session) -> IndexingJob | None:
    stmt = (
        select(IndexingJob)
        .where(IndexingJob.status.in_(_CLAIMABLE))  # type: ignore[attr-defined]
        .order_by(IndexingJob.created_at.asc())  # type: ignore[attr-defined]
        .limit(1)
    )
    job = session.exec(stmt).first()
    if job is None:
        return None
    now = utcnow()
    job.status = DocumentIndexingStatus.EXTRACTING
    job.started_at = now
    job.heartbeat_at = now
    session.add(job)
    _set_document_status(session, job.document_id, DocumentIndexingStatus.EXTRACTING)
    session.commit()
    session.refresh(job)
    return job


# --- Processing -------------------------------------------------------------------


def _set_document_status(session: Session, document_id: str, status: str) -> None:
    doc = session.get(Document, document_id)
    if doc is not None:
        doc.indexing_status = status
        doc.updated_at = utcnow()
        session.add(doc)


def _fail(session: Session, job: IndexingJob, *, reason: str, detail: object | None = None) -> None:
    job.status = DocumentIndexingStatus.FAILED
    job.error_reason = reason
    job.error_json = (
        {"reason": reason, "detail": redact_sensitive(detail)} if detail else {"reason": reason}
    )
    job.finished_at = utcnow()
    session.add(job)
    _set_document_status(session, job.document_id, DocumentIndexingStatus.FAILED)
    session.commit()


def _requeue_waiting(session: Session, job: IndexingJob) -> None:
    job.status = DocumentIndexingStatus.WAITING_FOR_RAG
    session.add(job)
    _set_document_status(session, job.document_id, DocumentIndexingStatus.WAITING_FOR_RAG)
    session.commit()


def _advance(session: Session, job: IndexingJob, status: str) -> None:
    job.status = status
    job.heartbeat_at = utcnow()
    session.add(job)
    _set_document_status(session, job.document_id, status)
    session.commit()


def _file_ingest_unsupported(exc: RagRequestError) -> bool:
    # 404: older service without /api/index/file. 422: service can't parse this file type.
    return exc.status_code in (404, 422)


def process_indexing_job(
    session: Session,
    job: IndexingJob,
    *,
    adapter: RagAdapter,
    settings: Settings,
    storage: LocalObjectStorage,
) -> None:
    """Run one claimed job to a terminal state."""
    started = time.monotonic()
    doc = session.get(Document, job.document_id)
    if doc is None:
        _fail(session, job, reason="document_missing")
        return

    # Cloud-egress gate: block sending document bytes to a cloud embedder / non-local service.
    block = rag_egress_block_detail(
        embedding_provider=settings.rag_embedding_provider,
        rag_url=settings.slimx_rag_url,
        allow_cloud_providers=settings.allow_cloud_providers,
    )
    if block is not None:
        _fail(session, job, reason="cloud_egress_blocked", detail=block)
        return

    try:
        data = storage.get_bytes(doc.object_key)
    except StorageObjectMissing:
        _fail(session, job, reason="original_file_unavailable")
        return

    _advance(session, job, DocumentIndexingStatus.CHUNKING)
    _advance(session, job, DocumentIndexingStatus.EMBEDDING)
    _advance(session, job, DocumentIndexingStatus.INDEXING)

    metadata: dict[str, object] = {
        "title": doc.title,
        "source_type": doc.source_type,
        "filename": doc.filename,
    }
    try:
        result = _ingest(adapter, doc, data, metadata, storage)
    except RagUnavailable:
        _requeue_waiting(session, job)
        return
    except _NoExtractableText:
        _fail(
            session,
            job,
            reason="no_extractable_text",
            detail="The file may be scanned or image-only; OCR is not supported yet.",
        )
        return
    except RagRequestError as exc:
        _fail(session, job, reason=f"index_failed: HTTP {exc.status_code}", detail=str(exc))
        return
    except Exception as exc:  # noqa: BLE001 — any ingest failure is a job failure, not a crash
        _fail(session, job, reason=f"index_failed: {type(exc).__name__}", detail=str(exc))
        return

    elapsed_ms = int((time.monotonic() - started) * 1000)
    job.status = DocumentIndexingStatus.READY
    job.chunk_count = result.chunk_count
    job.embedding_provider = result.embedding_provider
    job.embedding_model = result.embedding_model
    job.vector_backend = result.vector_backend
    job.rag_index_ref = result.rag_index_ref
    job.trace_json = _index_diagnostics(result)
    job.elapsed_ms = elapsed_ms
    job.finished_at = utcnow()
    session.add(job)
    doc.indexing_status = DocumentIndexingStatus.READY
    doc.rag_index_ref = result.rag_index_ref
    doc.status = DocumentStatus.PARSED
    doc.updated_at = utcnow()
    session.add(doc)
    session.commit()


class _NoExtractableText(Exception):
    pass


def _ingest(
    adapter: RagAdapter,
    doc: Document,
    data: bytes,
    metadata: dict[str, object],
    storage: LocalObjectStorage,
) -> IndexResult:
    """Prefer page-aware file ingest; fall back to flat text on 404/422."""
    try:
        return adapter.index_file(
            document_id=doc.id,
            data=data,
            filename=doc.filename,
            mime_type=doc.mime_type,
            source_metadata=metadata,
        )
    except RagRequestError as exc:
        if not _file_ingest_unsupported(exc):
            raise
    # File ingest unsupported: fall back to the extracted text.
    text = ""
    if doc.extracted_text_key:
        try:
            text = storage.get_text(doc.extracted_text_key)
        except StorageObjectMissing:
            text = ""
    if not text.strip():
        raise _NoExtractableText()
    result = adapter.index_document(document_id=doc.id, text=text, source_metadata=metadata)
    result.warnings = [
        *result.warnings,
        "degraded: indexed extracted text (page-aware ingest unsupported)",
    ]
    return result


def _index_diagnostics(result: IndexResult) -> dict[str, object]:
    return {
        "parser": result.parser,
        "parser_version": result.parser_version,
        "source_type": result.source_type,
        "page_count": result.page_count,
        "element_count": result.element_count,
        "parent_count": result.parent_count,
        "embedding_dim": result.embedding_dim,
        "warnings": result.warnings,
        "timings_ms": result.timings_ms,
    }


# --- Worker entrypoint & maintenance ----------------------------------------------


def _park_queued_jobs_waiting(session: Session) -> int:
    """Park queued jobs as waiting_for_rag when a real service is configured but down."""
    stmt = select(IndexingJob).where(
        IndexingJob.status == DocumentIndexingStatus.UPLOADED  # type: ignore[arg-type]
    )
    parked = 0
    for job in session.exec(stmt).all():
        job.status = DocumentIndexingStatus.WAITING_FOR_RAG
        session.add(job)
        _set_document_status(session, job.document_id, DocumentIndexingStatus.WAITING_FOR_RAG)
        parked += 1
    if parked:
        session.commit()
    return parked


def run_next_indexing_job(session: Session, *, settings: Settings | None = None) -> bool:
    """Claim and process one job. Returns True if a job was processed. Never drains into the fake
    adapter when a real service was configured but is unreachable."""
    settings = settings or get_settings()
    status = describe_rag_status(settings)
    if status.url_configured and not status.real_available:
        _park_queued_jobs_waiting(session)
        return False
    job = claim_next_job(session)
    if job is None:
        return False
    adapter = get_rag_adapter(settings)
    process_indexing_job(session, job, adapter=adapter, settings=settings, storage=get_storage())
    return True


def sweep_stale_indexing_jobs(session: Session, *, stale_after_seconds: int | None = None) -> int:
    """Requeue in-flight jobs left over from a crashed run (attempt++, fail after MAX_ATTEMPTS)."""
    settings = get_settings()
    cutoff_seconds = stale_after_seconds or settings.rag_stale_job_after_seconds
    cutoff = utcnow() - timedelta(seconds=cutoff_seconds)
    stmt = select(IndexingJob).where(IndexingJob.status.in_(_IN_FLIGHT))  # type: ignore[attr-defined]
    swept = 0
    for job in session.exec(stmt).all():
        marker = job.heartbeat_at or job.started_at
        if marker is not None and marker > cutoff:
            continue
        job.attempt += 1
        if job.attempt >= _MAX_ATTEMPTS:
            job.status = DocumentIndexingStatus.FAILED
            job.error_reason = "stale_max_attempts"
            job.finished_at = utcnow()
            _set_document_status(session, job.document_id, DocumentIndexingStatus.FAILED)
        else:
            job.status = DocumentIndexingStatus.UPLOADED
            _set_document_status(session, job.document_id, DocumentIndexingStatus.UPLOADED)
        session.add(job)
        swept += 1
    if swept:
        session.commit()
    return swept
