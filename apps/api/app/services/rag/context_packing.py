"""Token-aware context packing for grounded prompts.

Ported from SlimX-AI ControlRoom's context_packing.py (MIT). Admits whole chunks under a token
budget (never cut mid-sentence, citation never detached from its text), caps per parent, and skips
near-identical siblings. Every chunk is recorded as admitted or rejected (with token count + reason)
so the reader can show exactly what was sent. Token counts use a dependency-free ~4-chars/token
estimate; SlimX owns model execution and post-hoc Usage.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

_CHARS_PER_TOKEN = 4


def estimate_tokens(text: str) -> int:
    n = len(text or "")
    return 0 if n == 0 else max(1, math.ceil(n / _CHARS_PER_TOKEN))


@dataclass(slots=True)
class CandidateChunk:
    chunk_id: str
    text: str
    citation: str = ""
    document_id: str | None = None
    page: int | None = None
    section: str | None = None
    parent_id: str | None = None
    score: float = 0.0


@dataclass(slots=True)
class AdmittedChunk:
    chunk: CandidateChunk
    tokens: int


@dataclass(slots=True)
class PackResult:
    admitted: list[AdmittedChunk] = field(default_factory=list)
    rejected: list[dict[str, Any]] = field(default_factory=list)
    total_tokens: int = 0
    budget_tokens: int = 0


def pack_chunks(
    candidates: list[CandidateChunk], *, budget_tokens: int, max_per_parent: int = 2
) -> PackResult:
    """Admit whole chunks in order until the token budget is exhausted.

    Order is preserved (callers pass chunks already ranked by retrieval). A chunk is rejected —
    never truncated — when it would overflow the budget, when its parent is already at the cap, or
    when its text duplicates an admitted chunk.
    """
    result = PackResult(budget_tokens=max(0, budget_tokens))
    per_parent: dict[str, int] = {}
    seen: set[str] = set()
    used = 0

    def rejected(cand: CandidateChunk, reason: str, tokens: int) -> dict[str, Any]:
        return {
            "chunk_id": cand.chunk_id,
            "reason": reason,
            "tokens": tokens,
            "score": cand.score,
            "document_id": cand.document_id,
            "page": cand.page,
        }

    for cand in candidates:
        tokens = estimate_tokens(cand.text) + estimate_tokens(cand.citation)
        norm = " ".join((cand.text or "").split()).lower()
        parent = cand.parent_id or cand.chunk_id
        if not (cand.text or "").strip():
            result.rejected.append(rejected(cand, "empty", 0))
            continue
        if norm in seen:
            result.rejected.append(rejected(cand, "duplicate_text", tokens))
            continue
        if per_parent.get(parent, 0) >= max_per_parent:
            result.rejected.append(rejected(cand, "parent_cap", tokens))
            continue
        if used + tokens > result.budget_tokens:
            result.rejected.append(rejected(cand, "budget_exhausted", tokens))
            continue
        result.admitted.append(AdmittedChunk(chunk=cand, tokens=tokens))
        used += tokens
        seen.add(norm)
        per_parent[parent] = per_parent.get(parent, 0) + 1
    result.total_tokens = used
    return result
