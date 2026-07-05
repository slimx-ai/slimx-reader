"""Preflight checks for models and services.

Reports whether SlimX is importable, Ollama is reachable and has the default model, and SlimX-RAG is
ready — so the UI can tell the user what is available before they ask a question. All probes are
best-effort and never raise.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings
from app.services.rag.factory import describe_rag_status

_PROBE_TIMEOUT = 3.0


def slimx_status() -> dict[str, Any]:
    try:
        import slimx  # noqa: PLC0415

        return {"available": True, "version": getattr(slimx, "__version__", None)}
    except Exception as exc:  # noqa: BLE001 — a missing/broken slimx must not crash the probe
        return {"available": False, "version": None, "detail": type(exc).__name__}


def ollama_status(settings: Settings) -> dict[str, Any]:
    base = settings.ollama_base_url.rstrip("/")
    try:
        response = httpx.get(f"{base}/api/tags", timeout=_PROBE_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        models = [m.get("name") for m in data.get("models", []) if isinstance(m, dict)]
        return {"reachable": True, "base_url": base, "models": [m for m in models if m]}
    except Exception as exc:  # noqa: BLE001
        return {"reachable": False, "base_url": base, "models": [], "detail": type(exc).__name__}


def list_models(settings: Settings) -> list[dict[str, str]]:
    """Available model choices: local Ollama tags plus the configured default / oai option."""
    out: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(provider: str, model: str) -> None:
        key = f"{provider}:{model}"
        if model and key not in seen:
            seen.add(key)
            out.append({"provider": provider, "model": model, "ref": key})

    if settings.default_provider == "ollama":
        for name in ollama_status(settings).get("models", []):
            add("ollama", name)
    add(settings.default_provider, settings.default_model)
    if settings.oai_base_url:
        add("oai", settings.default_model)
    return out


def models_health(settings: Settings) -> dict[str, Any]:
    slimx = slimx_status()
    ollama = ollama_status(settings)
    rag = describe_rag_status(settings)
    default_ref = f"{settings.default_provider}:{settings.default_model}"
    default_available = (
        settings.default_provider != "ollama" or settings.default_model in ollama.get("models", [])
    )
    return {
        "slimx": slimx,
        "ollama": ollama,
        "rag": {
            "enabled": rag.enabled,
            "real_available": rag.real_available,
            "vector_backend": rag.vector_backend,
            "fallback_reason": rag.fallback_reason,
        },
        "default_model": {
            "ref": default_ref,
            "available": default_available,
            "cloud_enabled": settings.allow_cloud_providers,
        },
    }
