from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings

router = APIRouter(tags=["health"])

SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "slimx-reader-api"}


@router.get("/health/deep")
def health_deep(settings: SettingsDep) -> dict[str, Any]:
    """Shallow-by-default deep probe. RAG/model readiness is filled in by later phases."""
    return {
        "status": "ok",
        "rag": {
            "enabled": settings.enable_rag,
            "url_configured": bool(settings.slimx_rag_url),
        },
        "cloud_providers_enabled": settings.allow_cloud_providers,
    }
