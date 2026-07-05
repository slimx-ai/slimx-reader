from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.document_errors import ErrorCode, reader_error
from app.core.config import Settings, get_settings
from app.core.privacy import rag_egress_block_detail
from app.db.session import get_session
from app.models.retrieval_run import RetrievalRun, RetrievedChunk
from app.schemas.rag import (
    AskRequest,
    AskResponse,
    RagHealthResponse,
    RetrievalRunView,
    RetrievedChunkView,
    RetrieveRequest,
)
from app.services.rag.factory import describe_rag_status, get_rag_adapter
from app.services.rag.qa_service import answer_over_documents, list_run_chunks, perform_retrieval
from app.services.slimx_client import CloudEgressBlocked

router = APIRouter(prefix="/api/rag", tags=["rag"])

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("/health", response_model=RagHealthResponse)
def rag_health(settings: SettingsDep) -> RagHealthResponse:
    status = describe_rag_status(settings)
    return RagHealthResponse(
        enabled=status.enabled,
        url_configured=status.url_configured,
        adapter_kind=status.adapter_kind,
        real_available=status.real_available,
        fallback_reason=status.fallback_reason,
        service_url=status.service_url,
        vector_backend=status.vector_backend,
        auth_enabled=status.auth_enabled,
    )


def _guard_real_rag(settings: Settings) -> None:
    """Refuse to answer document questions from the fake corpus while a real service is down."""
    status = describe_rag_status(settings)
    if status.url_configured and not status.real_available:
        raise reader_error(
            503,
            ErrorCode.RAG_UNAVAILABLE,
            "SlimX-RAG is configured but unreachable. Start it, then retry.",
            fallback_reason=status.fallback_reason,
        )


def _guard_retrieval_egress(settings: Settings) -> None:
    block = rag_egress_block_detail(
        embedding_provider=settings.rag_embedding_provider,
        rag_url=settings.slimx_rag_url,
        allow_cloud_providers=settings.allow_cloud_providers,
    )
    if block is not None:
        extra = {k: v for k, v in block.items() if k != "message"}
        raise reader_error(403, ErrorCode.CLOUD_EGRESS_BLOCKED, block["message"], **extra)


@router.post("/retrieve", response_model=RetrievalRunView)
def retrieve(
    session: SessionDep, settings: SettingsDep, payload: RetrieveRequest
) -> RetrievalRunView:
    _guard_real_rag(settings)
    _guard_retrieval_egress(settings)
    run = perform_retrieval(
        session,
        adapter=get_rag_adapter(settings),
        question=payload.question,
        document_ids=payload.document_ids,
        top_k=payload.top_k or settings.rag_default_top_k,
        min_score=payload.min_score if payload.min_score is not None else settings.rag_min_score,
    )
    chunks = list_run_chunks(session, run.id)
    return _run_view(run, chunks)


@router.post("/ask", response_model=AskResponse)
def ask(session: SessionDep, settings: SettingsDep, payload: AskRequest) -> AskResponse:
    _guard_real_rag(settings)
    _guard_retrieval_egress(settings)
    try:
        outcome = answer_over_documents(
            session,
            adapter=get_rag_adapter(settings),
            settings=settings,
            question=payload.question,
            document_ids=payload.document_ids,
            top_k=payload.top_k or settings.rag_default_top_k,
            min_score=payload.min_score
            if payload.min_score is not None
            else settings.rag_min_score,
            generate=payload.generate,
        )
    except CloudEgressBlocked as exc:
        extra = {k: v for k, v in exc.detail.items() if k != "message"}
        raise reader_error(
            403, ErrorCode.CLOUD_EGRESS_BLOCKED, exc.detail["message"], **extra
        ) from exc
    return AskResponse(
        run_id=outcome.run.id,
        status=outcome.run.status,
        answer=outcome.answer,
        model_ref=outcome.model_ref,
        degraded_reason=outcome.degraded_reason,
        note=outcome.note,
        context_used=outcome.context_used,
        chunks=[RetrievedChunkView.from_model(c) for c in outcome.chunks],
    )


runs_router = APIRouter(prefix="/api/retrieval-runs", tags=["rag"])


@runs_router.get("/{run_id}", response_model=RetrievalRunView)
def get_retrieval_run(session: SessionDep, run_id: str) -> RetrievalRunView:
    run = session.get(RetrievalRun, run_id)
    if run is None:
        raise reader_error(404, ErrorCode.RETRIEVAL_RUN_NOT_FOUND, "Retrieval run not found.")
    return _run_view(run, list_run_chunks(session, run.id))


def _run_view(run: RetrievalRun, chunks: list[RetrievedChunk]) -> RetrievalRunView:
    return RetrievalRunView(
        id=run.id,
        question=run.question,
        status=run.status,
        top_k=run.top_k,
        min_score=run.min_score,
        chunk_count=len(chunks),
        elapsed_ms=run.elapsed_ms,
        embedding_provider=run.embedding_provider,
        embedding_model=run.embedding_model,
        vector_backend=run.vector_backend,
        answer=run.answer,
        model_ref=run.model_ref,
        context_snapshot=run.context_snapshot,
        chunks=[RetrievedChunkView.from_model(c) for c in chunks],
    )
