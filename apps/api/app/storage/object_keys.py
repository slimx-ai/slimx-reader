from __future__ import annotations

import re

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe(name: str) -> str:
    """Collapse anything unsafe for a path segment; never allow traversal."""
    cleaned = _SAFE.sub("_", name).strip("._") or "file"
    return cleaned[:200]


def document_original_key(document_id: str, filename: str) -> str:
    return f"documents/{_safe(document_id)}/original/{_safe(filename)}"


def document_extracted_text_key(document_id: str) -> str:
    return f"documents/{_safe(document_id)}/extracted/text.txt"


def document_prefix(document_id: str) -> str:
    return f"documents/{_safe(document_id)}"
