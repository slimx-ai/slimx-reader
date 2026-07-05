"""Real SlimX-RAG service client (service mode).

Ported from SlimX-AI ControlRoom's http_rag_adapter.py (MIT). Talks to the SlimX-RAG FastAPI server
over HTTP using the endpoints/JSON in contract.py. SlimX Reader never reimplements RAG — it only
orchestrates the remote service. The reader is single-user, so every call is scoped by the constant
``RAG_WORKSPACE_ID`` (injected here, never surfaced to callers). All errors are redacted before they
are raised so secrets never reach storage or the frontend.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import RAG_WORKSPACE_ID
from app.core.redaction import redact_sensitive
from app.services.rag.contract import (
    DeleteResult,
    DocumentChunkRef,
    EmbeddingConfig,
    Endpoints,
    IndexResult,
    RagHealth,
    RetrievedChunk,
    RetrieveResult,
    SetEmbeddingResult,
)
from app.services.rag.errors import RagRequestError, RagUnavailable


class HttpRagAdapter:
    def __init__(
        self, base_url: str, *, timeout: float = 120.0, auth_token: str | None = None
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._auth_token = auth_token

    def _headers(self) -> dict[str, str]:
        if self._auth_token:
            return {"Authorization": f"Bearer {self._auth_token}"}
        return {}

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        url = f"{self._base_url}{path}"
        try:
            response = httpx.request(
                method,
                url,
                json=json,
                params=params,
                headers=self._headers(),
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise RagUnavailable(
                f"SlimX-RAG service unreachable at {self._base_url}: {type(exc).__name__}"
            ) from exc
        if response.status_code >= 400:
            detail = redact_sensitive(_safe_json(response))
            raise RagRequestError(
                f"SlimX-RAG returned {response.status_code} for {path}: {detail}",
                status_code=response.status_code,
            )
        return _safe_json(response)

    def _request_file(self, path: str, *, data: dict[str, Any], files: dict[str, Any]) -> Any:
        url = f"{self._base_url}{path}"
        try:
            response = httpx.request(
                "POST", url, data=data, files=files, headers=self._headers(), timeout=self._timeout
            )
        except httpx.HTTPError as exc:
            raise RagUnavailable(
                f"SlimX-RAG service unreachable at {self._base_url}: {type(exc).__name__}"
            ) from exc
        if response.status_code >= 400:
            detail = redact_sensitive(_safe_json(response))
            raise RagRequestError(
                f"SlimX-RAG returned {response.status_code} for {path}: {detail}",
                status_code=response.status_code,
            )
        return _safe_json(response)

    def health(self) -> RagHealth:
        # Prefer the deep /ready probe (embedder loads, index writable, dim matches); fall back to
        # the shallow /health on an older service without /ready (404).
        try:
            response = httpx.request(
                "GET",
                f"{self._base_url}{Endpoints.READY}",
                headers=self._headers(),
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            return RagHealth(ok=False, detail=f"unreachable: {type(exc).__name__}")
        if response.status_code == 404:
            return self._shallow_health()
        data = _safe_json(response)
        body = data if isinstance(data, dict) else {}
        if response.status_code == 200 and body.get("ready"):
            model = body.get("embed_model")
            return RagHealth(
                ok=True,
                version=str(model) if model else None,
                vector_backend=body.get("index_backend"),
                detail=body.get("embed_provider"),
                auth_enabled=body.get("auth_enabled"),
            )
        return RagHealth(
            ok=False,
            vector_backend=body.get("index_backend"),
            detail=str(body.get("reason") or f"not ready ({response.status_code})"),
        )

    def _shallow_health(self) -> RagHealth:
        try:
            payload = self._request("GET", Endpoints.HEALTH)
        except RagUnavailable as exc:
            return RagHealth(ok=False, detail=str(exc))
        if not isinstance(payload, dict):
            return RagHealth(ok=True)
        return RagHealth(
            ok=payload.get("status") == "ok",
            version=payload.get("llm_model"),
            vector_backend=payload.get("index_backend"),
            detail=payload.get("embed_provider"),
            auth_enabled=payload.get("auth_enabled"),
        )

    def index_document(
        self, *, document_id: str, text: str, source_metadata: dict[str, Any] | None = None
    ) -> IndexResult:
        payload = self._request(
            "POST",
            Endpoints.INDEX,
            json={
                "workspace_id": RAG_WORKSPACE_ID,
                "document_id": document_id,
                "text": text,
                "metadata": source_metadata or {},
            },
        )
        data = payload if isinstance(payload, dict) else {}
        embed_raw = data.get("embed")
        embed = embed_raw if isinstance(embed_raw, dict) else {}
        return IndexResult(
            document_id=document_id,
            rag_index_ref=data.get("rag_index_ref")
            or f"slimx-rag:{data.get('doc_id') or document_id}",
            chunk_count=int(data.get("chunk_count") or 0),
            embedding_provider=embed.get("provider"),
            embedding_model=embed.get("model"),
            vector_backend=data.get("vector_backend"),
            status=str(data.get("status") or "ready"),
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
        form: dict[str, Any] = {
            "workspace_id": RAG_WORKSPACE_ID,
            "document_id": document_id,
            "filename": filename,
        }
        if mime_type:
            form["mime_type"] = mime_type
        title = (source_metadata or {}).get("title")
        if title:
            form["title"] = str(title)
        files = {"file": (filename, data, mime_type or "application/octet-stream")}
        payload = self._request_file(Endpoints.INDEX_FILE, data=form, files=files)
        body = payload if isinstance(payload, dict) else {}
        return IndexResult(
            document_id=document_id,
            rag_index_ref=body.get("rag_index_ref")
            or f"slimx-rag:{body.get('doc_id') or document_id}",
            chunk_count=int(body.get("chunk_count") or 0),
            embedding_provider=body.get("embedding_provider"),
            embedding_model=body.get("embedding_model"),
            vector_backend=body.get("vector_backend"),
            status=str(body.get("status") or "ready"),
            parser=body.get("parser"),
            parser_version=body.get("parser_version"),
            source_type=body.get("source_type"),
            page_count=_opt_int(body.get("page_count")),
            element_count=_opt_int(body.get("element_count")),
            parent_count=_opt_int(body.get("parent_count")),
            embedding_dim=_opt_int(body.get("embedding_dim")),
            embedding_max_seq_len=_opt_int(body.get("embedding_max_seq_len")),
            warnings=[str(w) for w in (body.get("warnings") or [])],
            timings_ms={str(k): int(v) for k, v in (body.get("timings_ms") or {}).items()},
        )

    def retrieve(
        self, *, question: str, document_ids: list[str] | None = None, top_k: int = 8
    ) -> RetrieveResult:
        body: dict[str, Any] = {
            "question": question,
            "top_k": top_k,
            "workspace_id": RAG_WORKSPACE_ID,
        }
        if document_ids:
            body["document_ids"] = [str(d) for d in document_ids]
        payload = self._request("POST", Endpoints.RETRIEVE, json=body)
        data = payload if isinstance(payload, dict) else {}
        raw_chunks = data.get("chunks") or []
        embed_raw = data.get("embed")
        embed = embed_raw if isinstance(embed_raw, dict) else {}
        chunks = [_chunk_from_json(item) for item in raw_chunks if isinstance(item, dict)]
        trace_raw = data.get("trace")
        trace = trace_raw if isinstance(trace_raw, dict) else None
        return RetrieveResult(
            chunks=chunks,
            elapsed_ms=data.get("elapsed_ms"),
            vector_backend=(trace or {}).get("vector_backend"),
            embedding_provider=embed.get("provider"),
            embedding_model=embed.get("model"),
            insufficient_context=not chunks,
            trace=trace,
        )

    def list_document_chunks(self, *, document_id: str) -> list[DocumentChunkRef]:
        # Best-effort inspection view: swallow request/transport errors (incl. an older service
        # without this endpoint) and return empty, so the chunk inspector never breaks the reader.
        try:
            payload = self._request(
                "GET",
                Endpoints.document_chunks(document_id),
                params={"workspace_id": RAG_WORKSPACE_ID},
            )
        except (RagRequestError, RagUnavailable):
            return []
        data = payload if isinstance(payload, dict) else {}
        raw_chunks = data.get("chunks") or []
        return [
            _document_chunk_from_json(item, ordinal)
            for ordinal, item in enumerate(raw_chunks)
            if isinstance(item, dict)
        ]

    def delete_document(self, *, document_id: str) -> DeleteResult:
        try:
            payload = self._request(
                "DELETE", Endpoints.document(document_id), params={"workspace_id": RAG_WORKSPACE_ID}
            )
        except (RagRequestError, RagUnavailable):
            return DeleteResult(ok=False, deleted_chunks=0)
        data = payload if isinstance(payload, dict) else {}
        return DeleteResult(ok=True, deleted_chunks=int(data.get("deleted_chunks") or 0))

    def set_embedding(self, *, config: EmbeddingConfig) -> SetEmbeddingResult:
        body = {
            key: value
            for key, value in {
                "provider": config.provider,
                "model": config.model,
                "hf_model": config.hf_model,
                "dim": config.dim,
                "device": config.device,
            }.items()
            if value is not None
        }
        payload = self._request("POST", Endpoints.SET_EMBEDDING, json=body)
        data = payload if isinstance(payload, dict) else {}
        embed_raw = data.get("embed")
        embed = embed_raw if isinstance(embed_raw, dict) else {}
        provider = embed.get("provider")
        model = embed.get("hf_model") if provider == "hf" else embed.get("model")
        return SetEmbeddingResult(
            embedding_provider=provider,
            embedding_model=model,
            embedding_device=embed.get("device"),
            dim=embed.get("dim"),
            index_reset=bool(data.get("index_reset")),
        )


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return {"detail": response.text[:500]}


def _opt_int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _document_chunk_from_json(item: dict[str, Any], ordinal_fallback: int) -> DocumentChunkRef:
    ordinal = item.get("ordinal")
    section = item.get("section")
    parent_id = item.get("parent_id")
    page_type = item.get("page_type")
    raw_path = item.get("section_path")
    section_path = (
        [str(part) for part in raw_path] if isinstance(raw_path, list) and raw_path else None
    )
    return DocumentChunkRef(
        rag_chunk_id=str(item.get("chunk_id") or item.get("rag_chunk_id") or ""),
        ordinal=ordinal
        if isinstance(ordinal, int) and not isinstance(ordinal, bool)
        else ordinal_fallback,
        text=str(item.get("text", "")),
        page=_opt_int(item.get("page")),
        section=str(section) if section is not None else None,
        start_offset=_opt_int(item.get("start_offset")),
        end_offset=_opt_int(item.get("end_offset")),
        section_path=section_path,
        parent_id=str(parent_id) if parent_id is not None else None,
        page_type=str(page_type) if page_type is not None else None,
        token_count=_opt_int(item.get("token_count")),
    )


def _chunk_from_json(item: dict[str, Any]) -> RetrievedChunk:
    raw_meta = item.get("metadata")
    metadata: dict[str, Any] = raw_meta if isinstance(raw_meta, dict) else {}
    page_value = metadata.get("page")
    page = page_value if isinstance(page_value, int) else None
    enriched: dict[str, Any] = dict(metadata)
    citation = item.get("citation")
    if citation:
        enriched["citation"] = citation
    document_id = metadata.get("document_id")
    return RetrievedChunk(
        rag_chunk_id=str(item.get("chunk_id") or ""),
        text=str(item.get("text", "")),
        score=float(item.get("score", 0.0)),
        document_id=str(document_id) if document_id else None,
        page=page,
        citation=str(citation) if citation else None,
        metadata=enriched,
    )
