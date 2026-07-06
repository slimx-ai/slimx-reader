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
  updateAnnotation,
} from '../../lib/api';
import { classifyUploadError, type DocumentError } from '../../lib/documentErrors';
import type {
  Annotation,
  AnnotationCreate,
  Document,
  DocumentChunk,
  DocumentContent,
  Note,
  ReaderSettings,
  RetrievedChunkView,
} from '../../lib/types';
import { ErrorCard } from '../common/ErrorCard';
import { ErrorToast } from '../common/ErrorToast';
import { LocalCloudBadge } from '../common/LocalCloudBadge';
import { Spinner } from '../common/Spinner';
import { AskPanel } from '../rag/AskPanel';
import { ChunkInspector } from '../rag/ChunkInspector';
import { IndexStatusBadge } from '../rag/IndexStatusBadge';
import { NotesPanel } from '../rag/NotesPanel';
import { CommentLayer } from './CommentLayer';
import { MarkdownReader } from './MarkdownReader';
import { PdfViewer } from './PdfViewer';
import { SelectionToolbar } from './SelectionToolbar';

type Tab = 'ask' | 'chunks' | 'notes' | 'info';

export function DocumentReader({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [error, setError] = useState<DocumentError | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'document' | 'text'>('document');
  const [tab, setTab] = useState<Tab>('ask');
  const [chunkRefreshKey, setChunkRefreshKey] = useState(0);
  // Transient failure notice for actions (delete/save/export) — never takes over the page.
  const [actionError, setActionError] = useState<string | null>(null);
  // Question seeded into the Ask tab from a text selection or a chunk ("Ask about this").
  const [askSeed, setAskSeed] = useState<{ text: string; nonce: number } | null>(null);

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
      } catch {
        setActionError('Could not save the annotation. Is the API still running?');
      }
    },
    [documentId],
  );

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setActionError('Could not delete the annotation — it was left in place. Try again.');
    }
  }, []);

  const handleUpdate = useCallback(
    async (id: string, patch: { body?: string; color?: string | null }) => {
      try {
        const updated = await updateAnnotation(id, patch);
        setAnnotations((prev) => prev.map((a) => (a.id === id ? updated : a)));
      } catch {
        setActionError('Could not update the annotation — the previous version was kept.');
      }
    },
    [],
  );

  const handleSaveEvidence = useCallback(
    async (chunk: RetrievedChunkView, runId: string) => {
      try {
        const body = `${chunk.citation ? `${chunk.citation}\n` : ''}${chunk.text}`;
        const note = await createNote({
          document_id: documentId,
          kind: 'evidence',
          body,
          retrieval_run_id: runId,
        });
        setNotes((prev) => [note, ...prev]);
        setTab('notes');
      } catch {
        setActionError('Could not save the evidence note.');
      }
    },
    [documentId],
  );

  const handleSaveAnswer = useCallback(
    async (answer: string, runId: string) => {
      try {
        const note = await createNote({
          document_id: documentId,
          kind: 'note',
          body: answer,
          retrieval_run_id: runId,
        });
        setNotes((prev) => [note, ...prev]);
        setTab('notes');
      } catch {
        setActionError('Could not save the answer as a note.');
      }
    },
    [documentId],
  );

  // "Save as evidence" from the chunk inspector (no retrieval run attached).
  const handleSaveChunkEvidence = useCallback(
    async (chunk: DocumentChunk) => {
      try {
        const where = [chunk.page ? `p. ${chunk.page}` : null, chunk.section]
          .filter(Boolean)
          .join(' · ');
        const note = await createNote({
          document_id: documentId,
          kind: 'evidence',
          body: `${where ? `${where}\n` : ''}${chunk.text}`,
        });
        setNotes((prev) => [note, ...prev]);
        setTab('notes');
      } catch {
        setActionError('Could not save the evidence note.');
      }
    },
    [documentId],
  );

  const handleDeleteNote = useCallback(async (id: string) => {
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setActionError('Could not delete the note. Try again.');
    }
  }, []);

  const handleDeleteDocument = useCallback(async () => {
    if (!window.confirm('Delete this document and all its annotations? This cannot be undone.')) {
      return;
    }
    try {
      await deleteDocument(documentId);
      window.location.href = '/';
    } catch {
      setActionError('Could not delete the document. Is the API still running?');
    }
  }, [documentId]);

  const handleExport = useCallback(
    async (kind: 'markdown' | 'json') => {
      try {
        await (kind === 'markdown' ? exportMarkdown(documentId) : exportJson(documentId));
      } catch {
        setActionError('Export failed. Is the API still running?');
      }
    },
    [documentId],
  );

  // Seed the Ask tab with a question about a selection or chunk.
  const handleAskQuote = useCallback((text: string) => {
    const excerpt = text.replace(/\s+/g, ' ').trim().slice(0, 300);
    setAskSeed({ text: `Explain this passage: “${excerpt}”`, nonce: Date.now() });
    setTab('ask');
  }, []);

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
              }}
            />
          ) : null}
          {settings ? <LocalCloudBadge cloudEnabled={settings.allow_cloud_providers} /> : null}
          {isPdf ? (
            <div className="reader-view-toggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={view === 'document' ? 'active' : ''}
                aria-pressed={view === 'document'}
                onClick={() => setView('document')}
              >
                Document
              </button>
              <button
                type="button"
                className={view === 'text' ? 'active' : ''}
                aria-pressed={view === 'text'}
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
            {tab === 'ask' ? (
              <AskPanel
                documentId={documentId}
                indexed={doc.indexing_status === 'ready'}
                seed={askSeed}
                defaultTopK={settings?.rag_default_top_k}
                defaultMinScore={settings?.rag_min_score}
                onSaveEvidence={handleSaveEvidence}
                onSaveAnswer={handleSaveAnswer}
              />
            ) : tab === 'chunks' ? (
              <ChunkInspector
                documentId={documentId}
                refreshKey={chunkRefreshKey}
                onSaveEvidence={handleSaveChunkEvidence}
                onAsk={(chunk) => handleAskQuote(chunk.text)}
              />
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
                    onClick={() => void handleExport('markdown')}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleExport('json')}
                  >
                    JSON
                  </button>
                </dd>
              </dl>
            )}
          </div>
        </aside>
      </div>

      <SelectionToolbar onCreate={handleCreate} onAsk={handleAskQuote} />
      <CommentLayer
        annotations={annotations}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
      {actionError ? (
        <ErrorToast message={actionError} onDismiss={() => setActionError(null)} />
      ) : null}
    </div>
  );
}
