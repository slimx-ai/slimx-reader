"""Text extraction for PDF / DOCX / Markdown / TXT / code.

Ported from SlimX-AI ControlRoom's services/document_extraction.py (MIT). PDF parsing runs in a
forked child process so a pathological file can be hard-killed on timeout. A scanned/image-only
PDF yields empty text (there is no OCR) — callers must surface that rather than fabricate content.
"""

from __future__ import annotations

import contextlib
import multiprocessing
import os
import tempfile
import xml.etree.ElementTree as ET
from io import BytesIO
from multiprocessing.connection import Connection
from zipfile import BadZipFile, ZipFile

from pypdf import PdfReader

PDF_MAX_PAGES = 500
PDF_EXTRACTION_TIMEOUT_SECONDS = 30.0

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
    """Extraction failed for a reason worth surfacing to the user."""


def _extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    if len(reader.pages) > PDF_MAX_PAGES:
        raise DocumentExtractionError(
            f"PDF has {len(reader.pages)} pages; the maximum supported is {PDF_MAX_PAGES}."
        )
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)


def _pdf_extract_worker(data: bytes, out_path: str, conn: Connection) -> None:
    """Parse a PDF in a forked child: write text to ``out_path``, report status over ``conn``.

    Fork (not spawn) keeps any test monkeypatch of ``_extract_pdf_text``/``PdfReader`` intact and
    avoids pickling; the large text goes through the temp file, only a tiny status tuple over the
    pipe.
    """
    try:
        text = _extract_pdf_text(data)
        with open(out_path, "w", encoding="utf-8") as handle:
            handle.write(text)
        conn.send(("ok", ""))
    except DocumentExtractionError as exc:
        conn.send(("doc_error", str(exc)))
    except Exception as exc:  # noqa: BLE001 — report any parse failure; never leave the parent hanging
        conn.send(("error", type(exc).__name__))
    finally:
        conn.close()


def _extract_pdf_text_bounded(data: bytes) -> str:
    # pypdf parses synchronously and a pathological PDF can spin for minutes. Run it in a forked
    # child so a timeout can HARD-KILL it (``terminate()``) — Python cannot kill a thread.
    ctx = multiprocessing.get_context("fork")
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
        kind, detail = parent_conn.recv()
        if kind == "ok":
            with open(out_path, encoding="utf-8") as handle:
                return handle.read()
        if kind == "doc_error":
            raise DocumentExtractionError(detail)
        raise DocumentExtractionError("PDF text extraction failed.")
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
        with ZipFile(BytesIO(data)) as archive:
            document_xml = archive.read("word/document.xml")
    except (BadZipFile, KeyError) as exc:
        raise DocumentExtractionError("DOCX text extraction failed: invalid DOCX file.") from exc

    try:
        root = ET.fromstring(document_xml)
    except ET.ParseError as exc:
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
        return source_type, _extract_pdf_text_bounded(data)
    if source_type == "docx":
        return source_type, _extract_docx_text(data)
    raise DocumentExtractionError(f"Unsupported document type: {source_type}.")


def count_pdf_pages(data: bytes) -> int | None:
    """Best-effort page count for a PDF; None if it can't be read."""
    try:
        return len(PdfReader(BytesIO(data)).pages)
    except Exception:  # noqa: BLE001 — page count is a nice-to-have, never fatal
        return None
