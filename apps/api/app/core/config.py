from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# SlimX-RAG scopes every document by ``doc_id = path_id("{workspace_id}/{document_id}")``.
# SlimX Reader is single-user, so it always passes this constant workspace id at the RAG
# adapter boundary and never surfaces workspaces in the API or UI. This keeps SlimX-RAG
# completely unmodified. See docs/rag-integration.md.
RAG_WORKSPACE_ID = "local"


class Settings(BaseSettings):
    """Runtime configuration. All values are overridable via ``READER_*`` env vars.

    Local-first defaults: cloud providers OFF, models point at localhost, and the app is
    fully usable for reading/annotation even with RAG disabled.
    """

    model_config = SettingsConfigDict(
        env_prefix="READER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Storage ---
    data_dir: Path = Path("./data")
    database_url: str = ""  # empty -> derived from data_dir (sqlite file)
    max_document_upload_mb: int = 50

    # --- Web / CORS ---
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # --- SlimX-RAG knowledge engine ---
    enable_rag: bool = True
    slimx_rag_url: str | None = "http://localhost:8080"
    slimx_rag_auth_token: str | None = None
    slimx_rag_request_timeout_seconds: float = 120.0
    rag_default_top_k: int = 8
    rag_min_score: float = 0.0
    rag_stale_job_after_seconds: int = 3600

    # --- Model execution (SlimX) ---
    default_provider: str = "ollama"
    default_model: str = "llama3.2:3b"
    ollama_base_url: str = "http://localhost:11434"
    oai_base_url: str | None = None
    oai_api_key: str = "EMPTY"

    # --- Privacy ---
    allow_cloud_providers: bool = False

    # --- Document extraction ---
    pdf_max_pages: int = 500

    @property
    def max_document_upload_bytes(self) -> int:
        return self.max_document_upload_mb * 1024 * 1024

    @property
    def documents_dir(self) -> Path:
        return self.data_dir / "documents"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(self.data_dir / 'reader.db').resolve()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
