"""Selects the active RAG adapter and describes why.

Ported from SlimX-AI ControlRoom's factory.py (MIT). Returns the deterministic ``FakeRagAdapter``
whenever RAG is disabled, unconfigured, or the real service is unhealthy — so the app (and CI) have
a working ``RagAdapter``. Returns the real ``HttpRagAdapter`` only when RAG is enabled, a URL is
configured, and a cached health probe succeeds. ``describe_rag_status`` reports whether real doc
RAG is actually usable, so callers refuse to answer document questions from the fake corpus when a
real service was configured but is down.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.services.rag.base import RagAdapter
from app.services.rag.contract import RagHealth
from app.services.rag.fake_rag_adapter import FakeRagAdapter
from app.services.rag.http_rag_adapter import HttpRagAdapter

_HEALTH_TTL_SECONDS = 30.0

_fake_adapter = FakeRagAdapter()
_http_adapter: HttpRagAdapter | None = None
_http_adapter_url: str | None = None
_last_health_check: float = 0.0
_last_health: RagHealth | None = None


@dataclass(frozen=True)
class RagStatus:
    enabled: bool
    url_configured: bool
    adapter_kind: str  # "http" | "fake"
    health_ok: bool
    real_available: bool
    fallback_reason: str | None  # "disabled" | "not_configured" | "service_unreachable" | None
    service_url: str | None
    vector_backend: str | None
    auth_enabled: bool | None = None


def _resolve_http_adapter(settings: Settings) -> HttpRagAdapter | None:
    global _http_adapter, _http_adapter_url, _last_health, _last_health_check
    url = settings.slimx_rag_url
    if not url:
        return None
    if _http_adapter is None or _http_adapter_url != url:
        _http_adapter = HttpRagAdapter(
            url,
            timeout=settings.slimx_rag_request_timeout_seconds,
            auth_token=settings.slimx_rag_auth_token,
        )
        _http_adapter_url = url
        _last_health = None
        _last_health_check = 0.0
    return _http_adapter


def _probe_health(http_adapter: HttpRagAdapter) -> RagHealth:
    """Cached (TTL) health probe. Never raises — a broken probe means ``ok=False``."""
    global _last_health_check, _last_health
    now = time.monotonic()
    if _last_health is None or now - _last_health_check > _HEALTH_TTL_SECONDS:
        try:
            _last_health = http_adapter.health()
        except Exception as exc:  # noqa: BLE001 — a health probe must never break selection
            _last_health = RagHealth(ok=False, detail=f"health probe failed: {type(exc).__name__}")
        _last_health_check = now
    return _last_health


def get_rag_adapter(settings: Settings | None = None) -> RagAdapter:
    """Return the active adapter (real if enabled+configured+healthy, else fake)."""
    settings = settings or get_settings()
    if not settings.enable_rag:
        return _fake_adapter
    http_adapter = _resolve_http_adapter(settings)
    if http_adapter is None:
        return _fake_adapter
    return http_adapter if _probe_health(http_adapter).ok else _fake_adapter


def describe_rag_status(settings: Settings | None = None) -> RagStatus:
    settings = settings or get_settings()
    url = settings.slimx_rag_url
    if not settings.enable_rag:
        return RagStatus(
            enabled=False,
            url_configured=bool(url),
            adapter_kind="fake",
            health_ok=False,
            real_available=False,
            fallback_reason="disabled",
            service_url=url,
            vector_backend="memory",
        )
    http_adapter = _resolve_http_adapter(settings)
    if http_adapter is None:
        return RagStatus(
            enabled=True,
            url_configured=False,
            adapter_kind="fake",
            health_ok=True,
            real_available=False,
            fallback_reason="not_configured",
            service_url=None,
            vector_backend="memory",
        )
    health = _probe_health(http_adapter)
    if health.ok:
        return RagStatus(
            enabled=True,
            url_configured=True,
            adapter_kind="http",
            health_ok=True,
            real_available=True,
            fallback_reason=None,
            service_url=url,
            vector_backend=health.vector_backend,
            auth_enabled=health.auth_enabled,
        )
    return RagStatus(
        enabled=True,
        url_configured=True,
        adapter_kind="fake",
        health_ok=False,
        real_available=False,
        fallback_reason="service_unreachable",
        service_url=url,
        vector_backend="memory",
    )


def reset_rag_adapter_cache() -> None:
    """Reset cached adapters/health — used by tests to isolate state."""
    global _fake_adapter, _http_adapter, _http_adapter_url, _last_health_check, _last_health
    _fake_adapter = FakeRagAdapter()
    _http_adapter = None
    _http_adapter_url = None
    _last_health_check = 0.0
    _last_health = None
