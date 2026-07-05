from __future__ import annotations

import json

from fastapi.testclient import TestClient


def _doc_with_data(client: TestClient) -> str:
    doc_id = client.post(
        "/api/documents/upload",
        files={"file": ("paper.md", b"The quick brown fox.", "text/markdown")},
    ).json()["id"]
    client.post(
        f"/api/documents/{doc_id}/annotations",
        json={"type": "highlight", "quote": "quick brown", "page": 1},
    )
    client.post(
        f"/api/documents/{doc_id}/annotations",
        json={"type": "comment", "quote": "fox", "body": "why a fox?"},
    )
    client.post("/api/notes", json={"document_id": doc_id, "kind": "evidence", "body": "384-dim"})
    return doc_id


def test_export_markdown(client: TestClient) -> None:
    doc_id = _doc_with_data(client)
    resp = client.post("/api/export/markdown", json={"document_id": doc_id})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    assert 'attachment; filename="paper.md"' in resp.headers["content-disposition"]
    body = resp.text
    assert "## Highlights" in body
    assert "quick brown" in body
    assert "## Comments" in body
    assert "why a fox?" in body
    assert "## Notes & evidence" in body
    assert "384-dim" in body


def test_export_json(client: TestClient) -> None:
    doc_id = _doc_with_data(client)
    resp = client.post("/api/export/json", json={"document_id": doc_id})
    assert resp.status_code == 200
    data = json.loads(resp.text)
    assert data["document"]["id"] == doc_id
    assert len(data["annotations"]) == 2
    assert len(data["notes"]) == 1
    assert data["notes"][0]["kind"] == "evidence"


def test_export_missing_document_is_404(client: TestClient) -> None:
    resp = client.post("/api/export/markdown", json={"document_id": "nope"})
    assert resp.status_code == 404
