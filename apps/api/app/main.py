from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app import __version__
from app.api import (
    routes_annotations,
    routes_documents,
    routes_export,
    routes_health,
    routes_models,
    routes_notes,
    routes_rag,
    routes_settings,
)
from app.core.config import get_settings
from app.db.session import create_db_and_tables, get_engine
from app.services.rag.indexing_service import sweep_stale_indexing_jobs
from app.services.rag.indexing_worker import indexing_worker_loop


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.documents_dir.mkdir(parents=True, exist_ok=True)
    settings.exports_dir.mkdir(parents=True, exist_ok=True)
    create_db_and_tables()

    worker_task: asyncio.Task[None] | None = None
    stop_event = asyncio.Event()
    if settings.enable_rag and settings.enable_indexing_worker:
        # Recover jobs left in-flight by a previous crashed run, then start the drain loop.
        with Session(get_engine()) as session:
            sweep_stale_indexing_jobs(session)
        worker_task = asyncio.create_task(indexing_worker_loop(stop_event))

    try:
        yield
    finally:
        stop_event.set()
        if worker_task is not None:
            await worker_task


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="SlimX Reader API",
        version=__version__,
        summary="Local-first document reader backend (SlimX + SlimX-RAG).",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )
    app.include_router(routes_health.router)
    app.include_router(routes_settings.router)
    app.include_router(routes_documents.router)
    app.include_router(routes_annotations.router)
    app.include_router(routes_rag.router)
    app.include_router(routes_rag.runs_router)
    app.include_router(routes_notes.router)
    app.include_router(routes_export.router)
    app.include_router(routes_models.router)
    return app


app = create_app()
