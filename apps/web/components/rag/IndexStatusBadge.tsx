'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getIndexingJob, indexDocument } from '../../lib/api';
import type { DocumentIndexingStatus, IndexingJob } from '../../lib/types';

const IN_FLIGHT: Set<string> = new Set([
  'uploaded',
  'extracting',
  'chunking',
  'embedding',
  'indexing',
]);
const TERMINAL: Set<string> = new Set(['ready', 'failed']);

const LABEL: Record<string, string> = {
  not_indexed: 'Not indexed',
  uploaded: 'Queued',
  waiting_for_rag: 'Waiting for SlimX-RAG',
  extracting: 'Extracting',
  chunking: 'Chunking',
  embedding: 'Embedding',
  indexing: 'Indexing',
  ready: 'Indexed',
  failed: 'Indexing failed',
};

/**
 * Shows a document's indexing status, polls while a job is in flight, and offers Index / Re-index /
 * Retry. Calls `onStatusChange` when the terminal status is reached so the reader can reveal chunks.
 */
export function IndexStatusBadge({
  documentId,
  status,
  ragEnabled,
  onStatusChange,
}: {
  documentId: string;
  status: DocumentIndexingStatus | string;
  ragEnabled: boolean;
  onStatusChange: (status: string, job: IndexingJob | null) => void;
}) {
  const [current, setCurrent] = useState<string>(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);

  useEffect(() => setCurrent(status), [status]);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!IN_FLIGHT.has(current) && current !== 'waiting_for_rag') {
      stopPolling();
      return;
    }
    attempts.current = 0;
    const tick = async () => {
      try {
        const job = await getIndexingJob(documentId);
        if (job) {
          if (job.status !== current) {
            setCurrent(job.status);
            if (TERMINAL.has(job.status)) {
              stopPolling();
              onStatusChange(job.status, job);
              return;
            }
          }
          if (job.status === 'failed') setError(job.error_reason);
        }
      } catch {
        // transient; keep polling
      }
      // Back off after the first minute so a long job (or a down RAG service) isn't hammered.
      attempts.current += 1;
      const delay = attempts.current < 40 ? 1500 : 5000;
      timer.current = setTimeout(tick, delay);
    };
    timer.current = setTimeout(tick, 1500);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, documentId]);

  const triggerIndex = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const job = await indexDocument(documentId);
      setCurrent(job.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start indexing.');
    } finally {
      setBusy(false);
    }
  }, [documentId]);

  const label = LABEL[current] ?? current;
  const canIndex = ragEnabled && !busy && (current === 'not_indexed' || TERMINAL.has(current));
  const actionLabel = current === 'ready' ? 'Re-index' : current === 'failed' ? 'Retry' : 'Index';

  return (
    <div className="index-status">
      <span className={`index-chip index-chip-${current}`}>{label}</span>
      {error ? <span className="index-status-error muted">{error}</span> : null}
      {ragEnabled ? (
        <button
          type="button"
          className="secondary-button"
          onClick={triggerIndex}
          disabled={!canIndex}
        >
          {busy ? 'Starting…' : actionLabel}
        </button>
      ) : (
        <span className="muted index-status-off">RAG disabled</span>
      )}
    </div>
  );
}
