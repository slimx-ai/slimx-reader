"""HTTP range serving for progressive PDF loading.

pdf.js opens a PDF with byte-range requests so page 1 renders before the whole file downloads.
This module parses a single ``Range: bytes=start-end`` header and builds a 206/200/416 response
from the local object store.
"""

from __future__ import annotations

import re
from collections.abc import Iterator

from fastapi import Response
from fastapi.responses import StreamingResponse

from app.storage.local_storage import LocalObjectStorage, StorageObjectMissing

_CHUNK = 256 * 1024


def _header_safe_filename(filename: str) -> str:
    """Sanitize a filename for a quoted Content-Disposition value (no quotes/control chars)."""
    cleaned = re.sub(r'[\r\n"\\]', "_", filename).strip()
    return cleaned[:150] or "document"


def _parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    """Return (start, end_inclusive) for a single byte range, or None for a full-body request.

    Raises ValueError for an unsatisfiable range (caller returns 416).
    """
    if not header:
        return None
    unit, _, spec = header.partition("=")
    if unit.strip().lower() != "bytes" or "," in spec:
        # Multi-range and non-byte units are not supported; serve the whole body.
        return None
    start_s, _, end_s = spec.strip().partition("-")
    if start_s == "":
        # Suffix range: last N bytes.
        if end_s == "":
            raise ValueError("empty range")
        length = int(end_s)
        if length <= 0:
            raise ValueError("bad suffix length")
        start = max(0, size - length)
        return start, size - 1
    start = int(start_s)
    end = int(end_s) if end_s else size - 1
    if start > end or start >= size:
        raise ValueError("range not satisfiable")
    end = min(end, size - 1)
    return start, end


def serve_object(
    storage: LocalObjectStorage,
    key: str,
    *,
    media_type: str,
    range_header: str | None,
    filename: str | None = None,
    method: str = "GET",
) -> Response:
    try:
        size = storage.stat_size(key)
    except StorageObjectMissing as exc:
        raise FileNotFoundError(key) from exc

    base_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
    }
    if filename:
        base_headers["Content-Disposition"] = (
            f'inline; filename="{_header_safe_filename(filename)}"'
        )

    try:
        rng = _parse_range(range_header, size)
    except ValueError:
        return Response(
            status_code=416,
            headers={**base_headers, "Content-Range": f"bytes */{size}"},
        )

    if method.upper() == "HEAD":
        return Response(
            status_code=200,
            media_type=media_type,
            headers={**base_headers, "Content-Length": str(size)},
        )

    if rng is None:
        return Response(
            content=storage.get_bytes(key),
            media_type=media_type,
            headers={**base_headers, "Content-Length": str(size)},
        )

    start, end = rng
    length = end - start + 1

    def _iter() -> Iterator[bytes]:
        remaining = length
        pos = start
        while remaining > 0:
            take = min(_CHUNK, remaining)
            yield storage.get_range(key, pos, pos + take - 1)
            pos += take
            remaining -= take

    return StreamingResponse(
        _iter(),
        status_code=206,
        media_type=media_type,
        headers={
            **base_headers,
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(length),
        },
    )
