'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { deleteDocument, getSettings, listDocuments } from '../../lib/api';
import { classifyUploadError, type DocumentError } from '../../lib/documentErrors';
import type { Document, ReaderSettings } from '../../lib/types';
import { EmptyState } from '../common/EmptyState';
import { ErrorCard } from '../common/ErrorCard';
import { LocalCloudBadge } from '../common/LocalCloudBadge';
import { Spinner } from '../common/Spinner';
import { UploadDropzone } from './UploadDropzone';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function LibraryView() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DocumentError | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [list, s] = await Promise.all([
        listDocuments({ q }),
        getSettings().catch(() => null),
      ]);
      setDocs(list.items);
      setSettings(s);
    } catch (err) {
      setError(classifyUploadError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteDocument(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return (
    <div className="library">
      <header className="library-header">
        <div>
          <h1 className="library-title">SlimX Reader</h1>
          <p className="library-subtitle muted">
            A local-first intelligent reader. Read, annotate, and ask — grounded in your documents.
          </p>
        </div>
        {settings ? <LocalCloudBadge cloudEnabled={settings.allow_cloud_providers} /> : null}
      </header>

      <UploadDropzone onUploaded={(doc) => setDocs((prev) => [doc, ...prev])} />

      <div className="library-toolbar">
        <input
          type="search"
          className="library-search"
          placeholder="Search documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load(query.trim() || undefined);
          }}
          aria-label="Search documents"
        />
        <button type="button" className="secondary-button" onClick={() => void load(query.trim() || undefined)}>
          Search
        </button>
      </div>

      {error ? <ErrorCard error={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <div className="library-loading">
          <Spinner label="Loading library…" />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState title="Your library is empty" icon="📚">
          Upload a PDF, DOCX, Markdown, or text file above to start reading.
        </EmptyState>
      ) : (
        <ul className="library-list">
          {docs.map((doc) => (
            <li key={doc.id} className="library-item">
              <Link href={`/reader/${doc.id}`} className="library-item-main">
                <span className="library-item-title">{doc.title}</span>
                <span className="library-item-meta muted">
                  {doc.source_type ?? 'file'}
                  {doc.page_count ? ` · ${doc.page_count} pages` : ''} ·{' '}
                  {(doc.file_size / 1024).toFixed(0)} KB · {formatDate(doc.created_at)}
                </span>
              </Link>
              <span className={`index-chip index-chip-${doc.indexing_status}`}>
                {doc.indexing_status.replace(/_/g, ' ')}
              </span>
              <button
                type="button"
                className="text-button danger"
                onClick={() => void handleDelete(doc.id)}
                aria-label={`Delete ${doc.title}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
