"""The only place SlimX Reader calls SlimX for generation.

SlimX is lazy-imported so the app still runs (retrieval-only) if it is missing or a model is
unreachable. The cloud-egress gate runs BEFORE any prompt leaves the machine, and errors are
redacted. Model string is ``provider:model_id``; base_url/api_key go through ``provider_kwargs``
(SlimX's ``Model.__init__`` takes only a fixed set of top-level kwargs).
"""

from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.core.privacy import provider_call_block_detail
from app.core.redaction import redact_sensitive


class ModelUnavailable(Exception):
    """SlimX is not importable, or the target model/provider could not be reached."""


class CloudEgressBlocked(Exception):
    """Generation was blocked because it would leave the machine while cloud is disabled."""

    def __init__(self, detail: dict[str, str]) -> None:
        super().__init__(detail.get("message", "Cloud egress blocked."))
        self.detail = detail


def build_model_ref(provider: str, model_id: str) -> str:
    """Build ``provider:model_id``. Rejects a model id that already carries a provider prefix."""
    provider = provider.strip()
    model_id = model_id.strip()
    if not provider or not model_id:
        raise ValueError("Both provider and model id are required.")
    return f"{provider}:{model_id}"


def _provider_kwargs(settings: Settings) -> tuple[dict[str, Any], str | None]:
    """Return (provider_kwargs, base_url) for the configured provider."""
    provider = settings.default_provider
    if provider == "ollama":
        return {"base_url": settings.ollama_base_url}, settings.ollama_base_url
    if provider == "oai":
        return (
            {"base_url": settings.oai_base_url, "api_key": settings.oai_api_key},
            settings.oai_base_url,
        )
    return {}, None  # cloud providers read keys from the environment


def generate(prompt: str, *, settings: Settings) -> dict[str, Any]:
    """Generate an answer. Raises CloudEgressBlocked / ModelUnavailable; never leaks secrets."""
    provider = settings.default_provider
    model = settings.default_model
    provider_kwargs, base_url = _provider_kwargs(settings)

    block = provider_call_block_detail(provider, base_url, settings.allow_cloud_providers)
    if block is not None:
        raise CloudEgressBlocked(block)

    try:
        from slimx import llm  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        raise ModelUnavailable(f"SlimX is not available: {type(exc).__name__}") from exc

    ref = build_model_ref(provider, model)
    try:
        model_obj = llm(
            ref,
            temperature=0.1,
            max_tokens=settings.answer_max_tokens,
            timeout=settings.model_timeout_seconds,
            retries=1,
            provider_kwargs=provider_kwargs,
        )
        result = model_obj(prompt)
    except Exception as exc:  # noqa: BLE001 — any provider/network failure -> model unavailable
        raise ModelUnavailable(str(redact_sensitive(str(exc)))) from exc

    usage = getattr(result, "usage", None)
    return {
        "text": getattr(result, "text", "") or "",
        "model_ref": ref,
        "usage": redact_sensitive(usage.__dict__)
        if usage is not None and hasattr(usage, "__dict__")
        else None,
    }
