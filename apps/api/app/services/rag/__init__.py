"""The only boundary in SlimX Reader that talks to SlimX-RAG.

Routes, services, and the frontend depend on the ``RagAdapter`` protocol here, never on HTTP
details. SlimX Reader is single-user, so it always passes the constant workspace id
(``RAG_WORKSPACE_ID = "local"``) to SlimX-RAG inside the HTTP adapter and never exposes
workspaces to callers. See docs/rag-integration.md.
"""

from app.services.rag.base import RagAdapter
from app.services.rag.factory import (
    describe_rag_status,
    get_rag_adapter,
    reset_rag_adapter_cache,
)

__all__ = [
    "RagAdapter",
    "describe_rag_status",
    "get_rag_adapter",
    "reset_rag_adapter_cache",
]
