from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services import slimx_client
from app.tests.conftest import drive_indexing_worker


def _upload_and_index(client: TestClient) -> str:
    resp = client.post(
        "/api/documents/upload",
        files={
            "file": (
                "notes.md",
                b"# Notes\n\nThe embedder dimension of the default local model is 384.",
                "text/markdown",
            )
        },
    )
    doc_id = resp.json()["id"]
    drive_indexing_worker()
    assert client.get(f"/api/documents/{doc_id}").json()["indexing_status"] == "ready"
    return doc_id


def test_retrieve_persists_run(rag_client: TestClient) -> None:
    doc_id = _upload_and_index(rag_client)
    resp = rag_client.post(
        "/api/rag/retrieve",
        json={"question": "What is the embedder dimension?", "document_ids": [doc_id]},
    )
    assert resp.status_code == 200, resp.text
    run = resp.json()
    assert run["status"] == "succeeded"
    assert run["chunk_count"] >= 1
    assert run["chunks"][0]["citation"]

    # The run is retrievable by id.
    fetched = rag_client.get(f"/api/retrieval-runs/{run['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == run["id"]


def test_ask_retrieval_only(rag_client: TestClient) -> None:
    doc_id = _upload_and_index(rag_client)
    resp = rag_client.post(
        "/api/rag/ask",
        json={"question": "embedder dimension", "document_ids": [doc_id], "generate": False},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "succeeded"
    assert body["answer"] is None
    assert body["chunks"]
    assert body["context_used"]["chunks_used"] >= 1


def test_ask_insufficient_context(rag_client: TestClient) -> None:
    doc_id = _upload_and_index(rag_client)
    resp = rag_client.post(
        "/api/rag/ask",
        json={"question": "zebra xylophone quokka", "document_ids": [doc_id]},
    )
    body = resp.json()
    assert body["status"] == "insufficient_context"
    assert body["degraded_reason"] == "insufficient"
    assert body["answer"] is None


def test_ask_min_score_filters_everything(rag_client: TestClient) -> None:
    doc_id = _upload_and_index(rag_client)
    resp = rag_client.post(
        "/api/rag/ask",
        json={"question": "embedder dimension", "document_ids": [doc_id], "min_score": 1.5},
    )
    assert resp.json()["status"] == "insufficient_context"


def test_ask_generates_answer(rag_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    doc_id = _upload_and_index(rag_client)
    monkeypatch.setattr(
        slimx_client,
        "generate",
        lambda prompt, *, settings: {
            "text": "The dimension is 384 [Notes, p. 1].",
            "model_ref": "ollama:llama3.2:3b",
            "usage": None,
        },
    )
    resp = rag_client.post(
        "/api/rag/ask",
        json={"question": "embedder dimension", "document_ids": [doc_id]},
    )
    body = resp.json()
    assert body["answer"] == "The dimension is 384 [Notes, p. 1]."
    assert body["model_ref"] == "ollama:llama3.2:3b"
    # The answer is persisted on the run.
    run = rag_client.get(f"/api/retrieval-runs/{body['run_id']}").json()
    assert run["answer"] == body["answer"]


def test_ask_degrades_when_model_unavailable(
    rag_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    doc_id = _upload_and_index(rag_client)

    def _raise(prompt: str, *, settings: object) -> dict:
        raise slimx_client.ModelUnavailable("ollama down")

    monkeypatch.setattr(slimx_client, "generate", _raise)
    resp = rag_client.post(
        "/api/rag/ask",
        json={"question": "embedder dimension", "document_ids": [doc_id]},
    )
    body = resp.json()
    assert body["degraded_reason"] == "model_unavailable"
    assert body["answer"] is None
    assert body["chunks"]  # retrieval still works; we just don't synthesize an answer


def test_ask_blocks_cloud_egress_by_default(rag_client: TestClient) -> None:
    doc_id = _upload_and_index(rag_client)
    # Switch to a cloud provider while cloud remains disabled.
    rag_client.patch("/api/settings", json={"default_provider": "openai"})
    resp = rag_client.post(
        "/api/rag/ask",
        json={"question": "embedder dimension", "document_ids": [doc_id]},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "cloud_egress_blocked"
