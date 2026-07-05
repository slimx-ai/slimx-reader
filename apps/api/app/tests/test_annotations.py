from __future__ import annotations

from fastapi.testclient import TestClient


def _new_doc(client: TestClient) -> str:
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("a.md", b"The quick brown fox jumps.", "text/markdown")},
    )
    return resp.json()["id"]


def test_annotation_crud_and_persistence(client: TestClient) -> None:
    doc_id = _new_doc(client)

    created = client.post(
        f"/api/documents/{doc_id}/annotations",
        json={
            "type": "highlight",
            "quote": "quick brown",
            "start_offset": 4,
            "end_offset": 15,
            "color": "#ffd54f",
            "labels": ["key"],
        },
    )
    assert created.status_code == 201, created.text
    ann = created.json()
    assert ann["quote"] == "quick brown"
    assert ann["labels"] == ["key"]
    ann_id = ann["id"]

    # Reload (fresh GET) — annotation persists.
    listed = client.get(f"/api/documents/{doc_id}/annotations").json()
    assert len(listed) == 1
    assert listed[0]["id"] == ann_id

    # Update: attach a comment body.
    patched = client.patch(
        f"/api/annotations/{ann_id}",
        json={"type": "comment", "body": "why is the fox quick?"},
    )
    assert patched.status_code == 200
    assert patched.json()["type"] == "comment"
    assert patched.json()["body"] == "why is the fox quick?"
    # Unset fields are untouched.
    assert patched.json()["quote"] == "quick brown"

    # Delete.
    assert client.delete(f"/api/annotations/{ann_id}").status_code == 204
    assert client.get(f"/api/documents/{doc_id}/annotations").json() == []


def test_annotation_stores_pdf_anchor_rects(client: TestClient) -> None:
    doc_id = _new_doc(client)
    anchor = {"rects": [{"page": 1, "x0": 0.1, "y0": 0.2, "x1": 0.8, "y1": 0.24}]}
    created = client.post(
        f"/api/documents/{doc_id}/annotations",
        json={"type": "highlight", "quote": "fox", "page": 1, "pdf_anchor": anchor},
    )
    assert created.status_code == 201
    assert created.json()["pdf_anchor"] == anchor


def test_annotation_on_missing_document_is_404(client: TestClient) -> None:
    resp = client.post(
        "/api/documents/nope/annotations",
        json={"type": "highlight", "quote": "x"},
    )
    assert resp.status_code == 404
