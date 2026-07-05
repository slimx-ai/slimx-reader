from __future__ import annotations

from fastapi.testclient import TestClient


def _new_doc(client: TestClient) -> str:
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("n.md", b"body text", "text/markdown")},
    )
    return resp.json()["id"]


def test_note_crud_and_evidence(client: TestClient) -> None:
    doc_id = _new_doc(client)

    created = client.post(
        "/api/notes",
        json={"document_id": doc_id, "kind": "evidence", "body": "Saved chunk: 384-dim."},
    )
    assert created.status_code == 201, created.text
    note = created.json()
    assert note["kind"] == "evidence"
    note_id = note["id"]

    listed = client.get(f"/api/documents/{doc_id}/notes").json()
    assert len(listed) == 1
    assert listed[0]["id"] == note_id

    patched = client.patch(f"/api/notes/{note_id}", json={"body": "edited"})
    assert patched.json()["body"] == "edited"
    assert patched.json()["kind"] == "evidence"

    assert client.delete(f"/api/notes/{note_id}").status_code == 204
    assert client.get(f"/api/documents/{doc_id}/notes").json() == []


def test_note_on_missing_document_is_404(client: TestClient) -> None:
    resp = client.post("/api/notes", json={"document_id": "nope", "body": "x"})
    assert resp.status_code == 404


def test_note_deleted_with_document(client: TestClient) -> None:
    doc_id = _new_doc(client)
    client.post("/api/notes", json={"document_id": doc_id, "body": "keep"})
    assert client.delete(f"/api/documents/{doc_id}").status_code == 204
    # Notes cascade with the document.
    assert client.get(f"/api/documents/{doc_id}/notes").status_code == 404
