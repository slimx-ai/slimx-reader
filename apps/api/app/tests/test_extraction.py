from __future__ import annotations

import pytest

from app.services.document_extraction import (
    DocumentExtractionError,
    count_pdf_pages,
    detect_source_type,
    extract_text,
    is_supported_document,
)
from app.tests.conftest import make_pdf


def test_detect_source_type() -> None:
    assert detect_source_type("a.pdf", None) == "pdf"
    assert detect_source_type("a.docx", None) == "docx"
    assert detect_source_type("a.md", None) == "markdown"
    assert detect_source_type("a.py", None) == "code"
    assert detect_source_type("a.txt", None) == "text"


def test_is_supported_document() -> None:
    assert is_supported_document("a.pdf", "application/pdf")
    assert is_supported_document("a.md", None)
    assert not is_supported_document("a.exe", "application/octet-stream")


def test_extract_text_plain_and_code() -> None:
    stype, text = extract_text("notes.md", "text/markdown", b"# Hello\n\nbody")
    assert stype == "markdown"
    assert "Hello" in text

    stype, text = extract_text("script.py", None, b"print('hi')")
    assert stype == "code"
    assert "print" in text


def test_extract_text_pdf() -> None:
    stype, text = extract_text("doc.pdf", "application/pdf", make_pdf("Retrieval augmented"))
    assert stype == "pdf"
    assert "Retrieval augmented" in text


def test_count_pdf_pages() -> None:
    assert count_pdf_pages(make_pdf()) == 1
    assert count_pdf_pages(b"not a pdf") is None


def test_extract_docx_invalid_raises() -> None:
    with pytest.raises(DocumentExtractionError):
        extract_text("bad.docx", None, b"not a real docx zip")
