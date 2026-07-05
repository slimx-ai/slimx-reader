from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.services.model_health import list_models, models_health

router = APIRouter(prefix="/api/models", tags=["models"])

SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("/health")
def model_health(settings: SettingsDep) -> dict[str, Any]:
    return models_health(settings)


@router.get("/list")
def models_list(settings: SettingsDep) -> dict[str, Any]:
    return {"models": list_models(settings)}
