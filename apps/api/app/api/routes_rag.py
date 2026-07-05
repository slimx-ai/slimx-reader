from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.rag import RagHealthResponse
from app.services.rag.factory import describe_rag_status

router = APIRouter(prefix="/api/rag", tags=["rag"])

SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("/health", response_model=RagHealthResponse)
def rag_health(settings: SettingsDep) -> RagHealthResponse:
    status = describe_rag_status(settings)
    return RagHealthResponse(
        enabled=status.enabled,
        url_configured=status.url_configured,
        adapter_kind=status.adapter_kind,
        real_available=status.real_available,
        fallback_reason=status.fallback_reason,
        service_url=status.service_url,
        vector_backend=status.vector_backend,
        auth_enabled=status.auth_enabled,
    )
