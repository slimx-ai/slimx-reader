from __future__ import annotations

from pydantic import BaseModel

from app.core.config import Settings


class SettingsRead(BaseModel):
    """Redacted, frontend-safe view of runtime settings."""

    enable_rag: bool
    slimx_rag_url: str | None
    slimx_rag_auth_token_set: bool
    allow_cloud_providers: bool
    default_provider: str
    default_model: str
    ollama_base_url: str
    oai_base_url: str | None
    rag_default_top_k: int
    rag_min_score: float
    max_document_upload_mb: int

    @classmethod
    def from_settings(cls, s: Settings) -> SettingsRead:
        return cls(
            enable_rag=s.enable_rag,
            slimx_rag_url=s.slimx_rag_url,
            slimx_rag_auth_token_set=bool(s.slimx_rag_auth_token),
            allow_cloud_providers=s.allow_cloud_providers,
            default_provider=s.default_provider,
            default_model=s.default_model,
            ollama_base_url=s.ollama_base_url,
            oai_base_url=s.oai_base_url,
            rag_default_top_k=s.rag_default_top_k,
            rag_min_score=s.rag_min_score,
            max_document_upload_mb=s.max_document_upload_mb,
        )


class SettingsUpdate(BaseModel):
    """Session-scoped, non-secret overrides a user can flip from the UI."""

    default_provider: str | None = None
    default_model: str | None = None
    allow_cloud_providers: bool | None = None
    rag_default_top_k: int | None = None
    rag_min_score: float | None = None
