"""Errors raised by the RAG boundary."""

from __future__ import annotations


class RagError(Exception):
    """Base class for RAG boundary failures."""


class RagUnavailable(RagError):
    """The SlimX-RAG service could not be reached or is unhealthy."""


class RagRequestError(RagError):
    """The SlimX-RAG service returned an error response.

    ``status_code`` is the HTTP status the service returned (when known), so callers can branch
    on it — e.g. treat 404/422 as "this SlimX-RAG build can't parse this file" and fall back.
    """

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
