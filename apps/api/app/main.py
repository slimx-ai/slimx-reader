from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import (
    routes_annotations,
    routes_documents,
    routes_health,
    routes_settings,
)
from app.core.config import get_settings
from app.db.session import create_db_and_tables


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.documents_dir.mkdir(parents=True, exist_ok=True)
    settings.exports_dir.mkdir(parents=True, exist_ok=True)
    create_db_and_tables()
    # The SlimX-RAG indexing worker is started here in Phase 3.
    yield


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
        # Expose range-serving headers so pdf.js can do progressive byte-range loads.
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )
    app.include_router(routes_health.router)
    app.include_router(routes_settings.router)
    app.include_router(routes_documents.router)
    app.include_router(routes_annotations.router)
    return app


app = create_app()
