"""Secret redaction for logs, persisted error records, and frontend responses.

Ported from SlimX-AI ControlRoom's slimx_adapter/redaction.py (MIT). Redacts credentials
both by sensitive key name and by known value shapes, so secrets never reach the database
(error_json), traces, or the frontend — even inside free-form provider error strings.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

SENSITIVE_KEY_RE = re.compile(
    r"(authorization|x-api-key|x-goog-api-key|api-key|openai_api_key|anthropic_api_key|"
    r"google_api_key|gemini_api_key|token|secret|password|credential)",
    re.IGNORECASE,
)
REDACTED = "[REDACTED]"
USAGE_TOKEN_KEYS = {
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "cached_tokens",
    "completion_tokens",
    "input_tokens",
    "max_tokens",
    "output_tokens",
    "prompt_tokens",
    "reasoning_tokens",
    "total_tokens",
}

# Value-level patterns protect free-form provider errors/traces that echo credentials
# outside fields with sensitive key names. Keep these anchored to known credential shapes
# to avoid broad false positives in ordinary prose.
BEARER_TOKEN_RE = re.compile(r"Bearer\s+[A-Za-z0-9._\-+/=]+", re.IGNORECASE)
API_KEY_PARAM_RE = re.compile(r"((?:api[_-]?key|key)=)[^\s&#]+", re.IGNORECASE)
URL_USERINFO_RE = re.compile(r"(https?://)([^\s/@:]+):([^\s/@]+)@", re.IGNORECASE)
KNOWN_TOKEN_LITERAL_RE = re.compile(
    r"(?<![A-Za-z0-9_\-])"
    r"(sk-[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9_]{16,}|xoxb-[A-Za-z0-9\-]{16,}|AIza[A-Za-z0-9_\-]{20,})"
)

# A bare base64 blob (no spaces) of payload size. Anchored full-string so ordinary prose
# (which has spaces/punctuation) never matches. Keeps decoded/base64 blobs out of snapshots.
_B64_BLOB_RE = re.compile(r"^[A-Za-z0-9+/=\r\n]{256,}$")


def _is_sensitive_key(key: Any) -> bool:
    key_text = str(key).lower()
    return key_text not in USAGE_TOKEN_KEYS and bool(SENSITIVE_KEY_RE.search(key_text))


def _elide_base64(value: str) -> str:
    """Replace a base64 blob / data URI with a short placeholder."""
    if value.startswith("data:") and ";base64," in value:
        head, b64 = value.split(";base64,", 1)
        return f"{head};base64,<{len(b64)} base64 chars elided>"
    if _B64_BLOB_RE.match(value):
        return f"<{len(value)} base64 chars elided>"
    return value


def _redact_string(value: str) -> str:
    value = _elide_base64(value)
    value = BEARER_TOKEN_RE.sub(f"Bearer {REDACTED}", value)
    value = API_KEY_PARAM_RE.sub(rf"\1{REDACTED}", value)
    value = URL_USERINFO_RE.sub(rf"\1{REDACTED}@", value)
    value = KNOWN_TOKEN_LITERAL_RE.sub(REDACTED, value)
    return value


def redact_sensitive(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            key: REDACTED if _is_sensitive_key(key) else redact_sensitive(nested)
            for key, nested in value.items()
        }
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_sensitive(item) for item in value)
    if isinstance(value, str):
        return _redact_string(value)
    return value
