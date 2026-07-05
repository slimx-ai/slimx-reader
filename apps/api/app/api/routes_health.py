from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.services.rag.factory import describe_rag_status

router = APIRouter(tags=["health"])

SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "slimx-reader-api"}


@router.get("/health/deep")
def health_deep(settings: SettingsDep) -> dict[str, Any]:
    """Deep probe: reports the SlimX-RAG adapter selection and cloud posture."""
    rag = describe_rag_status(settings)
    return {
        "status": "ok",
        "rag": {
            "enabled": rag.enabled,
            "url_configured": rag.url_configured,
            "adapter_kind": rag.adapter_kind,
            "real_available": rag.real_available,
            "fallback_reason": rag.fallback_reason,
            "vector_backend": rag.vector_backend,
        },
        "cloud_providers_enabled": settings.allow_cloud_providers,
    }
