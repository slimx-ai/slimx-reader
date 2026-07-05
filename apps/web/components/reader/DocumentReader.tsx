'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  createAnnotation,
  deleteAnnotation,
  deleteDocument,
  documentFileUrl,
  getDocument,
  getDocumentContent,
  getSettings,
  listAnnotations,
} from '../../lib/api';
import { classifyUploadError, type DocumentError } from '../../lib/documentErrors';
import type {
  Annotation,
  AnnotationCreate,
  Document,
  DocumentContent,
  ReaderSettings,
} from '../../lib/types';
import { AnnotationsPanel } from '../annotations/AnnotationsPanel';
import { ErrorCard } from '../common/ErrorCard';
import { LocalCloudBadge } from '../common/LocalCloudBadge';
import { Spinner } from '../common/Spinner';
import { MarkdownReader } from './MarkdownReader';
import { PdfViewer } from './PdfViewer';
import { SelectionToolbar } from './SelectionToolbar';

type Tab = 'annotations' | 'info';

export function DocumentReader({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [error, setError] = useState<DocumentError | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'document' | 'text'>('document');
  const [tab, setTab] = useState<Tab>('annotations');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, c, a, s] = await Promise.all([
        getDocument(documentId),
        getDocumentContent(documentId),
        listAnnotations(documentId),
        getSettings().catch(() => null),
      ]);
      setDoc(d);
      setContent(c);
      setAnnotations(a);
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
              </dl>
            )}
          </div>
        </aside>
      </div>

      <SelectionToolbar onCreate={handleCreate} />
    </div>
  );
}
