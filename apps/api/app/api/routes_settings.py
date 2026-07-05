from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.settings import SettingsRead, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])

SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("", response_model=SettingsRead)
def read_settings(settings: SettingsDep) -> SettingsRead:
    return SettingsRead.from_settings(settings)


@router.patch("", response_model=SettingsRead)
def update_settings(settings: SettingsDep, payload: SettingsUpdate) -> SettingsRead:
    """Apply non-secret, session-scoped overrides to the in-memory settings.

    Secrets (API keys, RAG token) are never set here — they come from the environment.
    Changes live for the process lifetime; persistent config belongs in .env.
    """
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(settings, key, value)
    return SettingsRead.from_settings(settings)
