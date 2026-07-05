"""The RagAdapter protocol.

Two implementations satisfy it: ``HttpRagAdapter`` (real SlimX-RAG service) and ``FakeRagAdapter``
(deterministic, network-free, the CI/offline default). Unlike ControlRoom the reader is single-user,
so there is no ``workspace_id`` parameter — the HTTP adapter injects the constant id.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from app.services.rag.contract import (
    DeleteResult,
    DocumentChunkRef,
    EmbeddingConfig,
    IndexResult,
    RagHealth,
    RetrieveResult,
    SetEmbeddingResult,
)


@runtime_checkable
class RagAdapter(Protocol):
    def health(self) -> RagHealth: ...

    def index_document(
        self,
        *,
        document_id: str,
        text: str,
        source_metadata: dict[str, Any] | None = None,
    ) -> IndexResult:
        """Ingest a document as flat text (fallback when file ingest is unsupported)."""
        ...

    def index_file(
        self,
        *,
        document_id: str,
        data: bytes,
        filename: str,
        mime_type: str | None = None,
        source_metadata: dict[str, Any] | None = None,
    ) -> IndexResult:
        """Ingest original bytes so SlimX-RAG parses page/section structure (preferred)."""
        ...

    def retrieve(
        self,
        *,
        question: str,
        document_ids: list[str] | None = None,
        top_k: int = 8,
    ) -> RetrieveResult: ...

    def list_document_chunks(self, *, document_id: str) -> list[DocumentChunkRef]:
        """Inspection view of what's in the index for a document. Empty list on any failure."""
        ...

    def delete_document(self, *, document_id: str) -> DeleteResult:
        """Best-effort, idempotent index removal. Must not raise."""
        ...

    def set_embedding(self, *, config: EmbeddingConfig) -> SetEmbeddingResult:
        """Switch the embedding provider/model (resets the vector space)."""
        ...
