from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Default the whole suite to run offline: cloud off, RAG off (fake adapter in later phases).
os.environ.setdefault("READER_ENABLE_RAG", "false")
os.environ.setdefault("READER_ALLOW_CLOUD_PROVIDERS", "false")

from app.core.config import get_settings  # noqa: E402
from app.db import session as db_session  # noqa: E402


def make_pdf(text: str = "Hello SlimX Reader") -> bytes:
    """Build a minimal, valid single-page PDF with extractable text (no external deps)."""
    content = f"BT /F1 24 Tf 72 700 Td ({text}) Tj ET\n".encode()
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"endstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_pos = len(out)
    size = len(objects) + 1
    out += f"xref\n0 {size}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF".encode()
    return bytes(out)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setenv("READER_DATA_DIR", str(data_dir))
    monkeypatch.setenv("READER_ENABLE_RAG", "false")
    monkeypatch.setenv("READER_ALLOW_CLOUD_PROVIDERS", "false")
    get_settings.cache_clear()
    db_session.reset_engine()

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client

    get_settings.cache_clear()
    db_session.reset_engine()
