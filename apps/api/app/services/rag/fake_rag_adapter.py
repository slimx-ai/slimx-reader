"""Deterministic, network-free RAG adapter.

Ported/simplified from SlimX-AI ControlRoom's fake_rag_adapter.py (MIT), dropping the workspace
dimension (the reader is single-user). This is the default whenever RAG is disabled or the real
SlimX-RAG service is unreachable, so the full RAG code path (jobs, retrieval, citations, evidence)
runs in CI and offline dev without SlimX-RAG, a vector backend, cloud keys, or Ollama. It is NOT a
real retriever — it only has to be deterministic and exercise every branch (incl. insufficient).
"""

from __future__ import annotations

import hashlib
import re
import time
from typing import Any

from app.services.rag.contract import (
    DeleteResult,
    DocumentChunkRef,
    EmbeddingConfig,
    IndexResult,
    RagHealth,
    RetrievedChunk,
    RetrieveResult,
    SetEmbeddingResult,
)

_FAKE_PROVIDER = "fake"
_FAKE_MODEL = "fake-embed"
_FAKE_BACKEND = "memory"
_CHUNK_CHARS = 480
_WORD_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return set(_WORD_RE.findall(text.lower()))


def _stable_score(seed: str, rank: int) -> float:
    digest = hashlib.sha256(f"{seed}:{rank}".encode()).hexdigest()
    base = int(digest[:8], 16) / 0xFFFFFFFF
    return round(max(0.0, 0.95 - rank * 0.07) * (0.85 + 0.15 * base), 4)


class FakeRagAdapter:
    """In-memory deterministic RagAdapter (single-user corpus keyed by document_id)."""

    def __init__(self) -> None:
        self._corpus: dict[str, str] = {}
        self._titles: dict[str, str] = {}

    def _title_for(self, document_id: str) -> str:
        return self._titles.get(document_id) or f"Document {document_id[:8]}"

    def health(self) -> RagHealth:
        return RagHealth(
            ok=True, version="fake", vector_backend=_FAKE_BACKEND, detail="fake adapter"
        )

    def _store(self, document_id: str, text: str, source_metadata: dict[str, Any] | None) -> int:
        self._corpus[document_id] = text or ""
        title = (source_metadata or {}).get("title")
        if isinstance(title, str) and title.strip():
            self._titles[document_id] = title
        return max(1, (len(text) + _CHUNK_CHARS - 1) // _CHUNK_CHARS) if text else 0

    def index_document(
        self, *, document_id: str, text: str, source_metadata: dict[str, Any] | None = None
    ) -> IndexResult:
        chunk_count = self._store(document_id, text, source_metadata)
        return IndexResult(
            document_id=document_id,
            rag_index_ref=f"fake-index:{document_id}",
            chunk_count=chunk_count,
            embedding_provider=_FAKE_PROVIDER,
            embedding_model=_FAKE_MODEL,
            vector_backend=_FAKE_BACKEND,
            status="ready",
        )

    def index_file(
        self,
        *,
        document_id: str,
        data: bytes,
        filename: str,
        mime_type: str | None = None,
        source_metadata: dict[str, Any] | None = None,
    ) -> IndexResult:
        text = data.decode("utf-8", errors="ignore") if isinstance(data, bytes) else str(data or "")
        meta = dict(source_metadata or {})
        meta.setdefault("title", filename)
        chunk_count = self._store(document_id, text, meta)
        return IndexResult(
            document_id=document_id,
            rag_index_ref=f"fake-index:{document_id}",
            chunk_count=chunk_count,
            embedding_provider=_FAKE_PROVIDER,
            embedding_model=_FAKE_MODEL,
            vector_backend=_FAKE_BACKEND,
            status="ready",
            parser="fake-parser",
            parser_version="1",
            source_type=(source_metadata or {}).get("source_type"),
            element_count=chunk_count,
            parent_count=chunk_count,
            embedding_dim=8,
        )

    def _candidate_docs(self, document_ids: list[str] | None) -> list[tuple[str, str]]:
        if document_ids:
            return [(d, self._corpus[d]) for d in document_ids if d in self._corpus]
        return list(self._corpus.items())

    def retrieve(
        self, *, question: str, document_ids: list[str] | None = None, top_k: int = 8
    ) -> RetrieveResult:
        started = time.monotonic()
        docs = self._candidate_docs(document_ids)
        q_tokens = _tokens(question)
        scored: list[tuple[int, str, str]] = []
        for document_id, text in docs:
            for start in range(0, len(text), _CHUNK_CHARS):
                chunk_text = text[start : start + _CHUNK_CHARS].strip()
                if not chunk_text:
                    continue
                overlap = len(q_tokens & _tokens(chunk_text))
                scored.append((overlap, document_id, chunk_text))
        relevant = [item for item in scored if item[0] > 0]
        relevant.sort(key=lambda item: item[0], reverse=True)
        selected = relevant[:top_k]
        elapsed_ms = int((time.monotonic() - started) * 1000)

        if not selected:
            return RetrieveResult(
                chunks=[],
                elapsed_ms=elapsed_ms,
                vector_backend=_FAKE_BACKEND,
                embedding_provider=_FAKE_PROVIDER,
                embedding_model=_FAKE_MODEL,
                insufficient_context=True,
                trace={"strategy": "fake", "final_count": 0},
            )

        chunks: list[RetrievedChunk] = []
        for rank, (_overlap, document_id, chunk_text) in enumerate(selected):
            score = _stable_score(question, rank)
            title = self._title_for(document_id)
            chunks.append(
                RetrievedChunk(
                    rag_chunk_id=f"{document_id}:{rank}",
                    text=chunk_text,
                    score=score,
                    document_id=document_id,
                    page=rank + 1,
                    start_offset=0,
                    end_offset=len(chunk_text),
                    embedding_provider=_FAKE_PROVIDER,
                    embedding_model=_FAKE_MODEL,
                    vector_backend=_FAKE_BACKEND,
                    citation=f"[{title}, p. {rank + 1}, Section {rank + 1}]",
                    metadata={
                        "rank": rank,
                        "source_title": title,
                        "section": f"Section {rank + 1}",
                        "page": rank + 1,
                        "fusion_rank": rank + 1,
                        "dense_score": score,
                    },
                )
            )
        return RetrieveResult(
            chunks=chunks,
            elapsed_ms=elapsed_ms,
            vector_backend=_FAKE_BACKEND,
            embedding_provider=_FAKE_PROVIDER,
            embedding_model=_FAKE_MODEL,
            insufficient_context=False,
            trace={"strategy": "fake", "final_count": len(chunks)},
        )

    def list_document_chunks(self, *, document_id: str) -> list[DocumentChunkRef]:
        text = self._corpus.get(document_id)
        if text is None:
            return []
        chunks: list[DocumentChunkRef] = []
        ordinal = 0
        for start in range(0, len(text), _CHUNK_CHARS):
            chunk_text = text[start : start + _CHUNK_CHARS].strip()
            if not chunk_text:
                continue
            chunks.append(
                DocumentChunkRef(
                    rag_chunk_id=f"{document_id}:{ordinal}",
                    ordinal=ordinal,
                    text=chunk_text,
                    page=ordinal + 1,
                    section=f"Section {ordinal + 1}",
                    start_offset=start,
                    end_offset=min(start + _CHUNK_CHARS, len(text)),
                    section_path=[self._title_for(document_id), f"Section {ordinal + 1}"],
                    parent_id=f"{document_id}:parent:{ordinal}",
                    page_type="text",
                    token_count=max(1, len(chunk_text) // 4),
                )
            )
            ordinal += 1
        return chunks

    def delete_document(self, *, document_id: str) -> DeleteResult:
        text = self._corpus.pop(document_id, None)
        self._titles.pop(document_id, None)
        if text is None:
            return DeleteResult(ok=True, deleted_chunks=0)
        chunk_count = max(1, (len(text) + _CHUNK_CHARS - 1) // _CHUNK_CHARS) if text else 0
        return DeleteResult(ok=True, deleted_chunks=chunk_count)

    def set_embedding(self, *, config: EmbeddingConfig) -> SetEmbeddingResult:
        self._corpus.clear()
        self._titles.clear()
        return SetEmbeddingResult(
            embedding_provider=config.provider or _FAKE_PROVIDER,
            embedding_model=config.hf_model or config.model or _FAKE_MODEL,
            embedding_device=config.device,
            dim=config.dim,
            index_reset=True,
        )
