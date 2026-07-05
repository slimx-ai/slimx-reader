"""Background indexing worker.

An asyncio loop (started in the FastAPI lifespan when RAG is enabled) that drains the indexing
queue by running ``run_next_indexing_job`` in a thread with a fresh Session per iteration. It drains
greedily, sleeps when idle, and never dies on a single bad job.
"""

from __future__ import annotations

import asyncio
import logging

from sqlmodel import Session

from app.core.config import get_settings
from app.db.session import get_engine
from app.services.rag.indexing_service import run_next_indexing_job

logger = logging.getLogger("slimx_reader.indexing")


def _run_one() -> bool:
    with Session(get_engine()) as session:
        return run_next_indexing_job(session)


async def indexing_worker_loop(stop_event: asyncio.Event) -> None:
    idle_sleep = get_settings().indexing_worker_idle_seconds
    while not stop_event.is_set():
        try:
            processed = await asyncio.to_thread(_run_one)
        except Exception:  # noqa: BLE001 — one bad job must never kill the worker
            logger.exception("indexing worker iteration failed")
            processed = False
        if not processed:
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=idle_sleep)
            except TimeoutError:
                pass
