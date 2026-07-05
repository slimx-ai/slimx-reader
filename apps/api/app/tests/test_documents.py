from __future__ import annotations

from fastapi.testclient import TestClient

from app.tests.conftest import make_pdf


def _upload(client: TestClient, name: str, content: bytes, content_type: str):
    return client.post(
        "/api/documents/upload",
        files={"file": (name, content, content_type)},
    )


def test_upload_markdown_persists_and_extracts(client: TestClient) -> None:
    resp = _upload(client, "notes.md", b"# Title\n\nHello **world**.", "text/markdown")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "notes.md"
    assert body["source_type"] == "markdown"
    assert body["file_size"] > 0
    assert body["content_hash"]
    doc_id = body["id"]

    # Metadata survives a fresh request (persisted in SQLite).
    got = client.get(f"/api/documents/{doc_id}")
    assert got.status_code == 200
    assert got.json()["id"] == doc_id

    # Extracted text is available for non-PDF documents immediately.
    content = client.get(f"/api/documents/{doc_id}/content")
    assert content.status_code == 200
    assert content.json()["available"] is True
    assert "Hello" in content.json()["text"]


def test_upload_pdf_sets_page_count(client: TestClient) -> None:
    resp = _upload(client, "doc.pdf", make_pdf("Grounded retrieval"), "application/pdf")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["source_type"] == "pdf"
    assert body["page_count"] == 1
    content = client.get(f"/api/documents/{body['id']}/content").json()
    assert "Grounded retrieval" in content["text"]


def test_list_search_and_sort(client: TestClient) -> None:
    _upload(client, "alpha.md", b"alpha content", "text/markdown")
    _upload(client, "beta.md", b"beta content", "text/markdown")
    listing = client.get("/api/documents", params={"q": "beta"}).json()
    assert listing["total"] == 1
    assert listing["items"][0]["title"] == "beta.md"

    everything = client.get("/api/documents").json()
    assert everything["total"] == 2


def test_file_range_serving(client: TestClient) -> None:
    pdf = make_pdf("Range me")
    doc_id = _upload(client, "range.pdf", pdf, "application/pdf").json()["id"]

    # HEAD reports size + Accept-Ranges.
    head = client.head(f"/api/documents/{doc_id}/file")
    assert head.status_code == 200
    assert head.headers["accept-ranges"] == "bytes"
    assert int(head.headers["content-length"]) == len(pdf)

    # A byte range returns 206 with the requested slice.
    ranged = client.get(f"/api/documents/{doc_id}/file", headers={"Range": "bytes=0-9"})
    assert ranged.status_code == 206
    assert ranged.headers["content-range"] == f"bytes 0-9/{len(pdf)}"
    assert ranged.content == pdf[:10]

    # An unsatisfiable range returns 416.
    bad = client.get(f"/api/documents/{doc_id}/file", headers={"Range": f"bytes={len(pdf)}-"})
    assert bad.status_code == 416


def test_delete_cascades_annotations(client: TestClient) -> None:
    doc_id = _upload(client, "del.md", b"delete me", "text/markdown").json()["id"]
    ann = client.post(
        f"/api/documents/{doc_id}/annotations",
        json={"type": "highlight", "quote": "delete", "start_offset": 0, "end_offset": 6},
    )
    assert ann.status_code == 201
    assert client.delete(f"/api/documents/{doc_id}").status_code == 204
    assert client.get(f"/api/documents/{doc_id}").status_code == 404
    # The annotation is gone with the document (FK cascade).
    assert client.get(f"/api/documents/{doc_id}/annotations").status_code == 404


def test_get_missing_document_is_404(client: TestClient) -> None:
    resp = client.get("/api/documents/does-not-exist")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "document_not_found"
