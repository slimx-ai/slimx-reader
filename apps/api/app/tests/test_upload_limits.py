from __future__ import annotations

from fastapi.testclient import TestClient


def test_unsupported_type_is_415(client: TestClient) -> None:
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("a.exe", b"MZ binary", "application/octet-stream")},
    )
    assert resp.status_code == 415
    assert resp.json()["detail"]["code"] == "unsupported_type"


def test_empty_file_is_400(client: TestClient) -> None:
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("empty.md", b"", "text/markdown")},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "bad_request"


def test_oversize_is_413(client: TestClient, monkeypatch) -> None:
    # Shrink the limit for this test via a fresh settings value.
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "max_document_upload_mb", 0)  # 0 MiB -> any content is too big
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("big.md", b"x" * 1024, "text/markdown")},
    )
    assert resp.status_code == 413
    assert resp.json()["detail"]["code"] == "file_too_large"
