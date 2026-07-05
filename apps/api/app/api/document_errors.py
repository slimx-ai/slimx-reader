"""Typed, redacted API errors.

The ``code`` strings are mirrored by the frontend (apps/web/lib/documentErrors.ts) so the UI can
show a helpful recovery action instead of a raw stack trace.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from app.core.redaction import redact_sensitive


class ErrorCode:
    FILE_TOO_LARGE = "file_too_large"
    UNSUPPORTED_TYPE = "unsupported_type"
    DOCUMENT_NOT_FOUND = "document_not_found"
    ANNOTATION_NOT_FOUND = "annotation_not_found"
    NOTE_NOT_FOUND = "note_not_found"
    EXTRACTION_FAILED = "extraction_failed"
    NO_EXTRACTABLE_TEXT = "no_extractable_text"
    STORAGE_ERROR = "storage_error"
    INVALID_RANGE = "invalid_range"
    RAG_DISABLED = "rag_disabled"
    RAG_UNAVAILABLE = "rag_unavailable"
    CLOUD_EGRESS_BLOCKED = "cloud_egress_blocked"
    MODEL_UNAVAILABLE = "model_unavailable"
    RETRIEVAL_RUN_NOT_FOUND = "retrieval_run_not_found"
    BAD_REQUEST = "bad_request"


def reader_error(status_code: int, code: str, message: str, **extra: Any) -> HTTPException:
    """Build an HTTPException whose ``detail`` is a redacted, structured payload."""
    detail: dict[str, Any] = {"code": code, "message": message}
    if extra:
        detail.update(extra)
    return HTTPException(status_code=status_code, detail=redact_sensitive(detail))
