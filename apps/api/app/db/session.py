from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import Settings, get_settings

_engine: Engine | None = None


def _make_engine(settings: Settings) -> Engine:
    url = settings.resolved_database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _enable_sqlite_fks(dbapi_connection, _connection_record):  # type: ignore[no-untyped-def]
            # FK enforcement is off by default in SQLite; our cascade/SET NULL semantics
            # depend on it. Enable per connection.
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        settings = get_settings()
        settings.documents_dir.mkdir(parents=True, exist_ok=True)
        settings.exports_dir.mkdir(parents=True, exist_ok=True)
        _engine = _make_engine(settings)
    return _engine


def reset_engine() -> None:
    """Drop the cached engine (used by tests that reconfigure settings)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def create_db_and_tables() -> None:
    # Import models so they register on SQLModel.metadata before create_all.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(get_engine())


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
