"""Cloud-egress classification and blocking.

Ported from SlimX-AI ControlRoom's core/privacy.py (MIT). When cloud is disabled, the API
must block any request that would send a prompt, document chunk, or evidence to a non-local
endpoint — before that data leaves the machine.
"""

from __future__ import annotations

from enum import StrEnum
from ipaddress import ip_address, ip_network
from urllib.parse import urlparse


class PrivacyState(StrEnum):
    LOCAL_ONLY = "Local-only"
    MIXED = "Mixed"
    CLOUD = "Cloud-provider active"
    UNKNOWN = "Unknown provider"


def is_local_base_url(base_url: str | None) -> bool:
    if not base_url:
        return False
    host = urlparse(base_url).hostname or base_url.split(":")[0]
    if host in {"localhost", "127.0.0.1", "::1", "host.docker.internal", "ollama"}:
        return True
    try:
        ip = ip_address(host)
    except ValueError:
        return False
    return any(
        ip in network
        for network in (
            ip_network("10.0.0.0/8"),
            ip_network("172.16.0.0/12"),
            ip_network("192.168.0.0/16"),
            ip_network("127.0.0.0/8"),
        )
    )


def classify_provider(provider: str, base_url: str | None = None) -> PrivacyState:
    normalized = provider.lower()
    if normalized == "ollama":
        return PrivacyState.LOCAL_ONLY
    if normalized in {"openai", "anthropic", "google", "gemini"}:
        return PrivacyState.CLOUD
    if normalized == "oai":
        return PrivacyState.LOCAL_ONLY if is_local_base_url(base_url) else PrivacyState.UNKNOWN
    return PrivacyState.UNKNOWN


def provider_call_block_detail(
    provider: str,
    base_url: str | None,
    allow_cloud_providers: bool,
) -> dict[str, str] | None:
    """Block a generation call that would leave the machine while cloud is disabled."""
    privacy = classify_provider(provider, base_url)
    if allow_cloud_providers:
        return None
    if privacy == PrivacyState.CLOUD:
        return {
            "message": (
                "Cloud providers are disabled. Set READER_ALLOW_CLOUD_PROVIDERS=true before "
                "sending prompts outside your machine."
            ),
            "privacy": privacy.value,
        }
    if privacy == PrivacyState.UNKNOWN and not is_local_base_url(base_url):
        return {
            "message": (
                "Provider locality is unknown. Configure a local base URL or set "
                "READER_ALLOW_CLOUD_PROVIDERS=true after opting in."
            ),
            "privacy": privacy.value,
        }
    return None


def _is_local_or_internal_url(url: str | None) -> bool:
    """Local/private hosts, plus bare single-label service names (e.g. ``slimx-rag``)."""
    if not url:
        return False
    if is_local_base_url(url):
        return True
    host = urlparse(url).hostname or url.split("/")[0].split(":")[0]
    # A single-label hostname has no dot and is not public DNS — it is an internal
    # container/service name on the local compose network.
    return bool(host) and "." not in host


def rag_egress_block_detail(
    *,
    embedding_provider: str,
    rag_url: str | None,
    allow_cloud_providers: bool,
) -> dict[str, str] | None:
    """Block SlimX-RAG indexing/retrieval that would send document text off-machine.

    Returns a block detail (to raise as 403) when cloud is disabled and either the embedding
    provider is a cloud provider or the SlimX-RAG service URL is non-local.
    """
    if allow_cloud_providers:
        return None
    if classify_provider(embedding_provider, rag_url) == PrivacyState.CLOUD:
        return {
            "message": (
                "Cloud embedding providers are disabled. Set READER_ALLOW_CLOUD_PROVIDERS=true "
                "before sending document text outside your machine."
            ),
            "privacy": PrivacyState.CLOUD.value,
        }
    if rag_url and not _is_local_or_internal_url(rag_url):
        return {
            "message": (
                "The SlimX-RAG service URL is not local. Configure a local/internal service "
                "or set READER_ALLOW_CLOUD_PROVIDERS=true after opting in."
            ),
            "privacy": PrivacyState.UNKNOWN.value,
        }
    return None
