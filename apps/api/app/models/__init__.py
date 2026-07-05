"""SQLModel tables. Importing this package registers every table on SQLModel.metadata."""

from app.models.annotation import Annotation, AnnotationType
from app.models.document import Document, DocumentIndexingStatus, DocumentStatus
from app.models.indexing_job import IndexingJob
from app.models.note import Note, NoteKind
from app.models.retrieval_run import RetrievalRun, RetrievalStatus, RetrievedChunk

__all__ = [
    "Annotation",
    "AnnotationType",
    "Document",
    "DocumentIndexingStatus",
    "DocumentStatus",
    "IndexingJob",
    "Note",
    "NoteKind",
    "RetrievalRun",
    "RetrievalStatus",
    "RetrievedChunk",
]
