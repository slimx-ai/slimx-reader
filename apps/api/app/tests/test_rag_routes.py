from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import get_settings
from app.db import session as db_session
from app.services.rag import factory
from app.services.rag.indexing_service import run_next_indexing_job


@pytest.fixture
def rag_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    # RAG enabled with no real service (fake adapter). Auto-worker off so the test drives the queue.
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setenv("READER_DATA_DIR", str(data_dir))
    monkeypatch.setenv("READER_ENABLE_RAG", "true")
    monkeypatch.setenv("READER_SLIMX_RAG_URL", "")
    monkeypatch.setenv("READER_ENABLE_INDEXING_WORKER", "false")
    monkeypatch.setenv("READER_ALLOW_CLOUD_PROVIDERS", "false")
    get_settings.cache_clear()
    db_session.reset_engine()
    factory.reset_rag_adapter_cache()
    from app.main import create_app

    with TestClient(create_app()) as client:
        yield client
    get_settings.cache_clear()
    db_session.reset_engine()
    factory.reset_rag_adapter_cache()


def _drive_worker() -> None:
    with Session(db_session.get_engine()) as session:
        while run_next_indexing_job(session):
            pass


def _upload(client: TestClient) -> str:
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("notes.md", b"# Notes\n\nThe embedder dimension is 384.", "text/markdown")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_upload_enqueues_and_indexes(rag_client: TestClient) -> None:
    doc_id = _upload(rag_client)

    job = rag_client.get(f"/api/documents/{doc_id}/indexing-job").json()
    assert job["status"] == "uploaded"

    _drive_worker()

    job = rag_client.get(f"/api/documents/{doc_id}/indexing-job").json()
    assert job["status"] == "ready"
    assert job["chunk_count"] >= 1

    doc = rag_client.get(f"/api/documents/{doc_id}").json()
    assert doc["indexing_status"] == "ready"

    chunks = rag_client.get(f"/api/documents/{doc_id}/chunks").json()
    assert chunks["status"] == "ready"
    assert chunks["chunk_count"] >= 1
    assert chunks["chunks"][0]["text"]


def test_index_is_idempotent_while_queued(rag_client: TestClient) -> None:
    doc_id = _upload(rag_client)
    # Auto-enqueued on upload; an explicit index call returns the same active job.
    first = rag_client.get(f"/api/documents/{doc_id}/indexing-job").json()
    again = rag_client.post(f"/api/documents/{doc_id}/index")
    assert again.status_code == 202
    assert again.json()["id"] == first["id"]


def test_chunks_before_index_is_not_indexed(rag_client: TestClient) -> None:
    doc_id = _upload(rag_client)
    chunks = rag_client.get(f"/api/documents/{doc_id}/chunks").json()
    assert chunks["status"] == "not_indexed"
    assert chunks["chunk_count"] == 0


def test_rag_health_endpoint(rag_client: TestClient) -> None:
    health = rag_client.get("/api/rag/health").json()
    assert health["enabled"] is True
    assert health["real_available"] is False
    assert health["fallback_reason"] == "not_configured"


def test_models_health_endpoint(rag_client: TestClient) -> None:
    health = rag_client.get("/api/models/health").json()
    assert "slimx" in health
    assert "ollama" in health
    assert health["default_model"]["cloud_enabled"] is False
