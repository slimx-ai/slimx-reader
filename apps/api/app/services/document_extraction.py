"""Text extraction for PDF / DOCX / Markdown / TXT / code.

Ported from SlimX-AI ControlRoom's services/document_extraction.py (MIT). PDF parsing runs in a
separate child process so a pathological file can be hard-killed on timeout. A scanned/image-only
PDF yields empty text (there is no OCR) — callers must surface that rather than fabricate content.
"""

from __future__ import annotations

import contextlib
import multiprocessing
import os
import tempfile
from io import BytesIO
from multiprocessing.connection import Connection
from typing import NamedTuple
from zipfile import BadZipFile, ZipFile

from defusedxml import ElementTree as ET  # hardened against entity-expansion attacks
from pypdf import PdfReader

PDF_MAX_PAGES = 500
PDF_EXTRACTION_TIMEOUT_SECONDS = 30.0
# Decompressed cap for the main DOCX XML part — stops zip-bomb style expansion.
DOCX_MAX_XML_BYTES = 50 * 1024 * 1024

TEXT_TYPES = {"text/plain", "text/markdown", "application/json"}
PDF_TYPES = {"application/pdf"}
DOCX_TYPES = {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
ALLOWED_MIME_TYPES = (
    TEXT_TYPES
    | PDF_TYPES
    | DOCX_TYPES
    | {
        "application/x-yaml",
        "text/x-python",
        "application/javascript",
        "text/javascript",
        "text/typescript",
    }
)
CODE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".md", ".txt", ".json", ".yaml", ".yml"}


def detect_source_type(filename: str, mime_type: str | None) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf") or mime_type == "application/pdf":
        return "pdf"
    if lower.endswith(".docx") or mime_type in DOCX_TYPES:
        return "docx"
    if lower.endswith(".md"):
        return "markdown"
    if any(lower.endswith(ext) for ext in CODE_EXTENSIONS):
        return "code" if not lower.endswith((".md", ".txt")) else "text"
    return "text" if mime_type in TEXT_TYPES else "code"


def is_supported_document(filename: str, mime_type: str | None) -> bool:
    lower = filename.lower()
    if mime_type in ALLOWED_MIME_TYPES:
        return True
    return lower.endswith((".pdf", ".docx")) or any(lower.endswith(ext) for ext in CODE_EXTENSIONS)


class DocumentExtractionError(Exception):
    """Extraction failed for a reason worth surfacing to the user.

    ``page_count`` is carried when the PDF was readable enough to count pages even though text
    extraction was refused/failed (e.g. over the page cap), so callers can still record it.
    """

    def __init__(self, message: str, *, page_count: int | None = None) -> None:
        super().__init__(message)
        self.page_count = page_count


class PdfExtraction(NamedTuple):
    text: str
    page_count: int | None


def _pdf_extract_worker(data: bytes, out_path: str, conn: Connection) -> None:
    """Parse a PDF in a child process: write text to ``out_path``, report status over ``conn``.

    The large text goes through the temp file; only a tiny (status, detail, page_count) tuple goes
    over the pipe. Page counting happens here too, so no untrusted PDF is ever parsed in-process.
    """
    page_count: int | None = None
    try:
        reader = PdfReader(BytesIO(data))
        page_count = len(reader.pages)
        if page_count > PDF_MAX_PAGES:
            raise DocumentExtractionError(
                f"PDF has {page_count} pages; the maximum supported is {PDF_MAX_PAGES}."
            )
        text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        with open(out_path, "w", encoding="utf-8") as handle:
            handle.write(text)
        conn.send(("ok", "", page_count))
    except DocumentExtractionError as exc:
        conn.send(("doc_error", str(exc), page_count))
    except Exception as exc:  # noqa: BLE001 — report any parse failure; never leave the parent hanging
        conn.send(("error", type(exc).__name__, page_count))
    finally:
        conn.close()


def _mp_context() -> multiprocessing.context.ForkContext | multiprocessing.context.SpawnContext:
    # Prefer fork (cheap, no re-import) where the platform offers it; fall back to spawn so the
    # same code runs on Windows, where fork does not exist. The worker fn is top-level, so it
    # pickles cleanly under spawn.
    if "fork" in multiprocessing.get_all_start_methods():
        return multiprocessing.get_context("fork")
    return multiprocessing.get_context("spawn")


def extract_pdf(data: bytes) -> PdfExtraction:
    """Extract text + page count from a PDF in a killable child process.

    pypdf parses synchronously and a pathological file can spin for minutes. The child can be
    HARD-KILLED on timeout (``terminate()``) — Python cannot kill a thread. Raises
    DocumentExtractionError (with ``page_count`` when known) on failure.
    """
    ctx = _mp_context()
    fd, out_path = tempfile.mkstemp(prefix="pdf-extract-", suffix=".txt")
    os.close(fd)
    parent_conn, child_conn = ctx.Pipe(duplex=False)
    proc = ctx.Process(target=_pdf_extract_worker, args=(data, out_path, child_conn), daemon=True)
    try:
        proc.start()
        child_conn.close()  # the parent only reads; close its copy so EOF is observable
        if not parent_conn.poll(PDF_EXTRACTION_TIMEOUT_SECONDS):
            proc.terminate()  # hard-kill the stuck parse — nothing is abandoned
            raise DocumentExtractionError(
                f"PDF text extraction timed out after {PDF_EXTRACTION_TIMEOUT_SECONDS:.0f} seconds."
            )
        kind, detail, page_count = parent_conn.recv()
        if kind == "ok":
            with open(out_path, encoding="utf-8") as handle:
                return PdfExtraction(text=handle.read(), page_count=page_count)
        if kind == "doc_error":
            raise DocumentExtractionError(detail, page_count=page_count)
        raise DocumentExtractionError("PDF text extraction failed.", page_count=page_count)
    except DocumentExtractionError:
        raise
    except (EOFError, OSError) as exc:
        raise DocumentExtractionError("PDF text extraction failed.") from exc
    finally:
        with contextlib.suppress(Exception):
            parent_conn.close()
        if proc.is_alive():
            proc.terminate()
        proc.join(timeout=5.0)
        if proc.is_alive():  # still stuck after SIGTERM — escalate
            proc.kill()
            proc.join(timeout=5.0)
        with contextlib.suppress(OSError):
            os.remove(out_path)


def _extract_docx_text(data: bytes) -> str:
    try:
        with ZipFile(BytesIO(data)) as archive, archive.open("word/document.xml") as entry:
            # Stream-decompress with a hard cap so a zip bomb can't exhaust memory.
            document_xml = entry.read(DOCX_MAX_XML_BYTES + 1)
    except (BadZipFile, KeyError) as exc:
        raise DocumentExtractionError("DOCX text extraction failed: invalid DOCX file.") from exc
    if len(document_xml) > DOCX_MAX_XML_BYTES:
        raise DocumentExtractionError("DOCX text extraction failed: document XML is too large.")

    try:
        root = ET.fromstring(document_xml)
    except (ET.ParseError, ValueError) as exc:
        # ValueError covers defusedxml's forbidden-construct errors (entity expansion, DTDs).
        raise DocumentExtractionError(
            "DOCX text extraction failed: malformed document XML."
        ) from exc

    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", namespace))
        if text.strip():
            paragraphs.append(text)
    return "\n\n".join(paragraphs)


def extract_text(filename: str, mime_type: str | None, data: bytes) -> tuple[str, str]:
    """Return (source_type, extracted_text). Raises DocumentExtractionError on failure."""
    source_type = detect_source_type(filename, mime_type)
    if source_type in {"markdown", "text", "code"}:
        return source_type, data.decode("utf-8", errors="replace")
    if source_type == "pdf":
        return source_type, extract_pdf(data).text
    if source_type == "docx":
        return source_type, _extract_docx_text(data)
    raise DocumentExtractionError(f"Unsupported document type: {source_type}.")
