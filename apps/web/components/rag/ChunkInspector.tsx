'use client';

import { useCallback, useEffect, useState } from 'react';
import { listDocumentChunks } from '../../lib/api';
import type { DocumentChunk } from '../../lib/types';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';

/**
 * Lists the chunks SlimX-RAG produced for a document (page, section, text) so the user can see
 * exactly what the index holds. `onSaveEvidence` / `onAsk` are wired in Phase 4.
 */
export function ChunkInspector({
  documentId,
  refreshKey = 0,
  onSaveEvidence,
  onAsk,
}: {
  documentId: string;
  refreshKey?: number;
  onSaveEvidence?: (chunk: DocumentChunk) => void;
  onAsk?: (chunk: DocumentChunk) => void;
}) {
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [status, setStatus] = useState<string>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await listDocumentChunks(documentId);
      setChunks(res.chunks);
      setStatus(res.status);
    } catch {
      setStatus('error');
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (status === 'loading') {
    return (
      <div className="chunk-inspector-loading">
        <Spinner label="Loading chunks…" />
      </div>
    );
  }
  if (status === 'not_indexed') {
    return (
      <EmptyState title="Not indexed yet">
        Index this document to inspect the chunks SlimX-RAG produced.
      </EmptyState>
    );
  }
  if (status === 'unavailable') {
    return (
      <EmptyState title="SlimX-RAG is unavailable">
        Start SlimX-RAG (<code>docker compose -f docker-compose.rag.yml up</code>) then reload.
      </EmptyState>
    );
  }
  if (status === 'error' || !chunks.length) {
    return <EmptyState title="No chunks to show" />;
  }

  return (
    <ul className="chunk-list">
      {chunks.map((chunk) => (
        <li key={chunk.rag_chunk_id} className="chunk-item">
          <div className="chunk-item-head">
            <span className="chunk-item-ordinal">Chunk #{chunk.ordinal + 1}</span>
            {chunk.page ? <span className="chunk-item-meta muted">p. {chunk.page}</span> : null}
            {chunk.section ? (
              <span className="chunk-item-meta muted">{chunk.section}</span>
            ) : null}
            {chunk.token_count ? (
              <span className="chunk-item-meta muted">{chunk.token_count} tok</span>
            ) : null}
          </div>
          <p className="chunk-item-text">{chunk.text}</p>
          <div className="chunk-item-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => void navigator.clipboard?.writeText(chunk.text)}
            >
              Copy
            </button>
            {onSaveEvidence ? (
              <button type="button" className="text-button" onClick={() => onSaveEvidence(chunk)}>
                Save as evidence
              </button>
            ) : null}
            {onAsk ? (
              <button type="button" className="text-button" onClick={() => onAsk(chunk)}>
                Ask about this
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
