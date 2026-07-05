from __future__ import annotations

from fastapi.testclient import TestClient

from app.tests.conftest import drive_indexing_worker as _drive_worker


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
