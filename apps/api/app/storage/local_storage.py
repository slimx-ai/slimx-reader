from __future__ import annotations

import shutil
from pathlib import Path

from app.core.config import get_settings


class StorageError(Exception):
    """A storage operation failed."""


class StorageObjectMissing(StorageError):
    """The requested object does not exist."""


class LocalObjectStorage:
    """A tiny local-filesystem object store keyed by relative paths.

    Replaces ControlRoom's MinIO ``ObjectStorage`` for the single-machine reader. Keys are
    plain relative paths (see object_keys.py) rooted under ``data/``. Provides the subset the
    reader needs: put/get/get_text/get_range/stat/delete, where get_range/stat back HTTP range
    serving for progressive PDF loading.
    """

    def __init__(self, root: Path) -> None:
        self._root = root.resolve()

    def _path(self, key: str) -> Path:
        # Resolve and confine to root — reject traversal.
        candidate = (self._root / key).resolve()
        if candidate != self._root and self._root not in candidate.parents:
            raise StorageError(f"Refusing to access key outside storage root: {key!r}")
        return candidate

    def put_bytes(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def put_text(self, key: str, text: str) -> None:
        self.put_bytes(key, text.encode("utf-8"))

    def put_stream(self, key: str, source: Path) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, path)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def get_bytes(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise StorageObjectMissing(key)
        return path.read_bytes()

    def get_text(self, key: str) -> str:
        return self.get_bytes(key).decode("utf-8", errors="replace")

    def stat_size(self, key: str) -> int:
        path = self._path(key)
        if not path.is_file():
            raise StorageObjectMissing(key)
        return path.stat().st_size

    def get_range(self, key: str, start: int, end_inclusive: int) -> bytes:
        """Read bytes [start, end_inclusive]. Caller validates the range against the size."""
        path = self._path(key)
        if not path.is_file():
            raise StorageObjectMissing(key)
        length = end_inclusive - start + 1
        with path.open("rb") as handle:
            handle.seek(start)
            return handle.read(length)

    def delete_object(self, key: str) -> None:
        path = self._path(key)
        if path.is_file():
            path.unlink()

    def delete_prefix(self, prefix: str) -> None:
        path = self._path(prefix)
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)


def get_storage() -> LocalObjectStorage:
    return LocalObjectStorage(get_settings().data_dir)
