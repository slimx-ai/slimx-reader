from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlmodel import Session

from app.core.config import get_settings
from app.db import session as db_session
from app.models.document import Document, DocumentIndexingStatus
from app.services.documents import create_document
from app.services.rag import factory
from app.services.rag.base import RagAdapter
from app.services.rag.contract import DeleteResult, IndexResult
from app.services.rag.errors import RagRequestError
from app.services.rag.fake_rag_adapter import FakeRagAdapter
from app.services.rag.indexing_service import (
    _ingest,
    _NoExtractableText,
    enqueue_index,
    run_next_indexing_job,
)
from app.storage.local_storage import get_storage


def _configure(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, *, url: str) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir(exist_ok=True)
    monkeypatch.setenv("READER_DATA_DIR", str(data_dir))
    monkeypatch.setenv("READER_ENABLE_RAG", "true")
    monkeypatch.setenv("READER_SLIMX_RAG_URL", url)
    monkeypatch.setenv("READER_ALLOW_CLOUD_PROVIDERS", "false")
    get_settings.cache_clear()
    db_session.reset_engine()
    factory.reset_rag_adapter_cache()
    db_session.create_db_and_tables()


@pytest.fixture
def fake_rag(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Session]:
    # enable_rag=true with no URL -> fake adapter, url_configured=False (indexing runs into fake).
    _configure(monkeypatch, tmp_path, url="")
    with Session(db_session.get_engine()) as session:
        yield session
    get_settings.cache_clear()
    db_session.reset_engine()
    factory.reset_rag_adapter_cache()


# --- Fake adapter --------------------------------------------------------------


def test_fake_adapter_index_and_retrieve() -> None:
    adapter = FakeRagAdapter()
    adapter.index_document(
        document_id="d1",
        text="The embedding dimension of the default local embedder is 384.",
        source_metadata={"title": "Notes"},
    )
    result = adapter.retrieve(question="What is the embedding dimension?", top_k=5)
    assert not result.insufficient_context
    assert result.chunks
    assert result.chunks[0].citation and "Notes" in result.chunks[0].citation

    empty = adapter.retrieve(question="completely unrelated zebra xylophone", top_k=5)
    assert empty.insufficient_context
    assert empty.chunks == []


def test_fake_adapter_scopes_to_document_ids() -> None:
    adapter = FakeRagAdapter()
    adapter.index_document(document_id="a", text="alpha content about retrieval")
    adapter.index_document(document_id="b", text="beta content about retrieval")
    scoped = adapter.retrieve(question="retrieval", document_ids=["a"], top_k=5)
    assert {c.document_id for c in scoped.chunks} == {"a"}


def test_fake_adapter_delete_is_idempotent() -> None:
    adapter = FakeRagAdapter()
    adapter.index_document(document_id="a", text="content")
    assert adapter.delete_document(document_id="a").ok
    # Deleting again (unknown) is a no-op with 0 chunks.
    again = adapter.delete_document(document_id="a")
    assert again.ok and again.deleted_chunks == 0


# --- Factory gate --------------------------------------------------------------


def test_factory_disabled_returns_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("READER_ENABLE_RAG", "false")
    get_settings.cache_clear()
    factory.reset_rag_adapter_cache()
    status = factory.describe_rag_status(get_settings())
    assert status.adapter_kind == "fake"
    assert status.real_available is False
    assert status.fallback_reason == "disabled"
    get_settings.cache_clear()


def test_factory_enabled_no_url_is_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("READER_ENABLE_RAG", "true")
    monkeypatch.setenv("READER_SLIMX_RAG_URL", "")
    get_settings.cache_clear()
    factory.reset_rag_adapter_cache()
    status = factory.describe_rag_status(get_settings())
    assert status.adapter_kind == "fake"
    assert status.fallback_reason == "not_configured"
    get_settings.cache_clear()


# --- Indexing lifecycle --------------------------------------------------------


def _new_markdown_doc(
    session: Session, text: str = "# Doc\n\nGrounded retrieval content."
) -> Document:
    return create_document(
        session, get_storage(), filename="doc.md", mime_type="text/markdown", data=text.encode()
    )


def test_indexing_lifecycle_reaches_ready(fake_rag: Session) -> None:
    doc = _new_markdown_doc(fake_rag)
    enqueue_index(fake_rag, document=doc)
    assert doc.indexing_status == DocumentIndexingStatus.UPLOADED

    processed = run_next_indexing_job(fake_rag)
    assert processed is True

    fake_rag.refresh(doc)
    assert doc.indexing_status == DocumentIndexingStatus.READY
    from app.services.rag.indexing_service import latest_job_for_document

    job = latest_job_for_document(fake_rag, doc.id)
    assert job is not None
    assert job.status == DocumentIndexingStatus.READY
    assert (job.chunk_count or 0) >= 1


def test_indexing_parks_waiting_when_real_service_down(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A configured-but-unreachable service must never drain into the fake adapter.
    _configure(monkeypatch, tmp_path, url="http://127.0.0.1:9")
    with Session(db_session.get_engine()) as session:
        doc = _new_markdown_doc(session)
        enqueue_index(session, document=doc)
        processed = run_next_indexing_job(session)
        assert processed is False
        session.refresh(doc)
        assert doc.indexing_status == DocumentIndexingStatus.WAITING_FOR_RAG
    get_settings.cache_clear()
    db_session.reset_engine()
    factory.reset_rag_adapter_cache()


# --- _ingest fallback ----------------------------------------------------------


class _StubUnsupportedFile:
    """Adapter whose page-aware file ingest is unsupported (422)."""

    def index_file(self, **_kwargs: object) -> IndexResult:
        raise RagRequestError("cannot parse", status_code=422)

    def index_document(self, *, document_id: str, text: str, source_metadata=None) -> IndexResult:
        return IndexResult(document_id=document_id, chunk_count=1, status="ready")

    def delete_document(self, **_kwargs: object) -> DeleteResult:
        return DeleteResult(ok=True)


def test_ingest_falls_back_to_text_when_file_unsupported(fake_rag: Session) -> None:
    doc = _new_markdown_doc(fake_rag, text="fallback body text here")
    adapter: RagAdapter = _StubUnsupportedFile()  # type: ignore[assignment]
    result = _ingest(adapter, doc, b"raw", {"title": doc.title}, get_storage())
    assert result.chunk_count == 1
    assert any("degraded" in w for w in result.warnings)


def test_ingest_raises_no_extractable_text(fake_rag: Session) -> None:
    doc = _new_markdown_doc(fake_rag)
    doc.extracted_text_key = None  # simulate a scanned PDF: no text to fall back to
    adapter: RagAdapter = _StubUnsupportedFile()  # type: ignore[assignment]
    with pytest.raises(_NoExtractableText):
        _ingest(adapter, doc, b"raw", {}, get_storage())
