'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  createAnnotation,
  createNote,
  deleteAnnotation,
  deleteDocument,
  deleteNote,
  documentFileUrl,
  exportJson,
  exportMarkdown,
  getDocument,
  getDocumentContent,
  getSettings,
  listAnnotations,
  listNotes,
} from '../../lib/api';
import { classifyUploadError, type DocumentError } from '../../lib/documentErrors';
import type {
  Annotation,
  AnnotationCreate,
  Document,
  DocumentContent,
  Note,
  ReaderSettings,
  RetrievedChunkView,
} from '../../lib/types';
import { AnnotationsPanel } from '../annotations/AnnotationsPanel';
import { ErrorCard } from '../common/ErrorCard';
import { LocalCloudBadge } from '../common/LocalCloudBadge';
import { Spinner } from '../common/Spinner';
import { AskPanel } from '../rag/AskPanel';
import { ChunkInspector } from '../rag/ChunkInspector';
import { IndexStatusBadge } from '../rag/IndexStatusBadge';
import { NotesPanel } from '../rag/NotesPanel';
import { MarkdownReader } from './MarkdownReader';
import { PdfViewer } from './PdfViewer';
import { SelectionToolbar } from './SelectionToolbar';

type Tab = 'annotations' | 'ask' | 'chunks' | 'notes' | 'info';

export function DocumentReader({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [error, setError] = useState<DocumentError | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'document' | 'text'>('document');
  const [tab, setTab] = useState<Tab>('annotations');
  const [chunkRefreshKey, setChunkRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, c, a, n, s] = await Promise.all([
        getDocument(documentId),
        getDocumentContent(documentId),
        listAnnotations(documentId),
        listNotes(documentId).catch(() => []),
        getSettings().catch(() => null),
      ]);
      setDoc(d);
      setContent(c);
      setAnnotations(a);
      setNotes(n);
      setSettings(s);
      setView(d.source_type === 'pdf' ? 'document' : 'text');
    } catch (err) {
      setError(classifyUploadError(err));
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(
    async (payload: AnnotationCreate) => {
      try {
        const created = await createAnnotation(documentId, payload);
        setAnnotations((prev) => [...prev, created]);
      } catch (err) {
        setError(classifyUploadError(err));
      }
    },
    [documentId],
  );

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // Non-fatal: leave the annotation in place; the user can retry.
    }
  }, []);

  const handleSaveEvidence = useCallback(
    async (chunk: RetrievedChunkView, runId: string) => {
      const body = `${chunk.citation ? `${chunk.citation}\n` : ''}${chunk.text}`;
      const note = await createNote({
        document_id: documentId,
        kind: 'evidence',
        body,
        retrieval_run_id: runId,
      });
      setNotes((prev) => [note, ...prev]);
      setTab('notes');
    },
    [documentId],
  );

  const handleSaveAnswer = useCallback(
    async (answer: string, runId: string) => {
      const note = await createNote({
        document_id: documentId,
        kind: 'note',
        body: answer,
        retrieval_run_id: runId,
      });
      setNotes((prev) => [note, ...prev]);
      setTab('notes');
    },
    [documentId],
  );

  const handleDeleteNote = useCallback(async (id: string) => {
    await deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleDeleteDocument = useCallback(async () => {
    if (!window.confirm('Delete this document and all its annotations? This cannot be undone.')) {
      return;
    }
    await deleteDocument(documentId);
    window.location.href = '/';
  }, [documentId]);

  if (loading) {
    return (
      <div className="reader-loading">
        <Spinner label="Opening document…" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="reader-error-wrap">
        <Link href="/" className="text-button">
          ← Library
        </Link>
        <ErrorCard
          error={error ?? { code: 'unknown', message: 'Document unavailable.', retryable: true }}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const isPdf = doc.source_type === 'pdf';

  return (
    <div className="reader">
      <header className="reader-topbar">
        <div className="reader-topbar-left">
          <Link href="/" className="text-button" aria-label="Back to library">
            ← Library
          </Link>
          <h1 className="reader-title" title={doc.filename}>
            {doc.title}
          </h1>
        </div>
        <div className="reader-topbar-right">
          {settings ? (
            <IndexStatusBadge
              documentId={documentId}
              status={doc.indexing_status}
              ragEnabled={settings.enable_rag}
              onStatusChange={(status) => {
                setDoc((prev) =>
                  prev
                    ? { ...prev, indexing_status: status as Document['indexing_status'] }
                    : prev,
                );
                setChunkRefreshKey((k) => k + 1);
                if (status === 'ready') setTab('chunks');
              }}
            />
          ) : null}
          {settings ? <LocalCloudBadge cloudEnabled={settings.allow_cloud_providers} /> : null}
          {isPdf ? (
            <div className="reader-view-toggle" role="tablist" aria-label="View mode">
              <button
                type="button"
                className={view === 'document' ? 'active' : ''}
                onClick={() => setView('document')}
              >
                Document
              </button>
              <button
                type="button"
                className={view === 'text' ? 'active' : ''}
                onClick={() => setView('text')}
              >
                Text
              </button>
            </div>
          ) : null}
          <button type="button" className="text-button danger" onClick={handleDeleteDocument}>
            Delete
          </button>
        </div>
      </header>

      <div className="reader-body">
        <main className="reader-canvas">
          {isPdf && view === 'document' ? (
            <PdfViewer url={documentFileUrl(documentId)} annotations={annotations} />
          ) : content?.available ? (
            <MarkdownReader
              text={content.text}
              sourceType={doc.source_type}
              annotations={annotations}
            />
          ) : (
            <div className="reader-no-text muted">
              No extractable text is available for this document
              {isPdf ? ' — it may be scanned or image-only (OCR is planned).' : '.'}
            </div>
          )}
        </main>

        <aside className="reader-panel">
          <div className="reader-panel-tabs" role="tablist" aria-label="Reader panel">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'annotations'}
              className={tab === 'annotations' ? 'active' : ''}
              onClick={() => setTab('annotations')}
            >
              Annotations
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'ask'}
              className={tab === 'ask' ? 'active' : ''}
              onClick={() => setTab('ask')}
            >
              Ask
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chunks'}
              className={tab === 'chunks' ? 'active' : ''}
              onClick={() => setTab('chunks')}
            >
              Chunks
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'notes'}
              className={tab === 'notes' ? 'active' : ''}
              onClick={() => setTab('notes')}
            >
              Notes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'info'}
              className={tab === 'info' ? 'active' : ''}
              onClick={() => setTab('info')}
            >
              Info
            </button>
          </div>
          <div className="reader-panel-body">
            {tab === 'annotations' ? (
              <AnnotationsPanel annotations={annotations} onDelete={handleDelete} />
            ) : tab === 'ask' ? (
              <AskPanel
                documentId={documentId}
                indexed={doc.indexing_status === 'ready'}
                onSaveEvidence={handleSaveEvidence}
                onSaveAnswer={handleSaveAnswer}
              />
            ) : tab === 'chunks' ? (
              <ChunkInspector documentId={documentId} refreshKey={chunkRefreshKey} />
            ) : tab === 'notes' ? (
              <NotesPanel notes={notes} onDelete={handleDeleteNote} />
            ) : (
              <dl className="reader-info">
                <dt>Filename</dt>
                <dd>{doc.filename}</dd>
                <dt>Type</dt>
                <dd>{doc.source_type ?? doc.mime_type ?? 'unknown'}</dd>
                <dt>Size</dt>
                <dd>{(doc.file_size / 1024).toFixed(1)} KB</dd>
                {doc.page_count ? (
                  <>
                    <dt>Pages</dt>
                    <dd>{doc.page_count}</dd>
                  </>
                ) : null}
                <dt>Indexing</dt>
                <dd>{doc.indexing_status}</dd>
                <dt>Export</dt>
                <dd className="reader-info-export">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void exportMarkdown(documentId)}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void exportJson(documentId)}
                  >
                    JSON
                  </button>
                </dd>
              </dl>
            )}
          </div>
        </aside>
      </div>

      <SelectionToolbar onCreate={handleCreate} />
    </div>
  );
}
