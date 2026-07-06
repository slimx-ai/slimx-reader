'use client';

import { useEffect, useRef, useState } from 'react';
import { askOverDocuments } from '../../lib/api';
import { classifyUploadError, type DocumentError } from '../../lib/documentErrors';
import type { AskResponse, RetrievedChunkView } from '../../lib/types';
import { EmptyState } from '../common/EmptyState';
import { ErrorCard } from '../common/ErrorCard';
import { Spinner } from '../common/Spinner';
import { CitationsPanel } from './CitationsPanel';
import { ContextUsedPanel } from './ContextUsedPanel';

const DEGRADED_LABEL: Record<string, string> = {
  insufficient: 'No grounded answer',
  failed: 'Retrieval failed',
  model_unavailable: 'No model — retrieved context only',
};

/**
 * Ask a grounded question over the current document. Shows the answer, the context used, and the
 * citations. Degrades clearly when there is no relevant context or no model is available.
 */
export function AskPanel({
  documentId,
  indexed,
  seed,
  defaultTopK,
  defaultMinScore,
  onSaveEvidence,
  onSaveAnswer,
}: {
  documentId: string;
  indexed: boolean;
  /** Question text pushed in from a selection or chunk ("Ask"). The nonce forces re-seeding. */
  seed?: { text: string; nonce: number } | null;
  defaultTopK?: number;
  defaultMinScore?: number;
  onSaveEvidence?: (chunk: RetrievedChunkView, runId: string) => void;
  onSaveAnswer?: (answer: string, runId: string) => void;
}) {
  const [question, setQuestion] = useState(seed?.text ?? '');
  const [topK, setTopK] = useState(defaultTopK ?? 8);
  const [minScore, setMinScore] = useState(defaultMinScore ?? 0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<DocumentError | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const seenSeed = useRef<number | null>(seed?.nonce ?? null);

  // A fresh seed (new nonce) replaces the question and focuses the input, even while mounted.
  useEffect(() => {
    if (!seed || seed.nonce === seenSeed.current) return;
    seenSeed.current = seed.nonce;
    setQuestion(seed.text);
    inputRef.current?.focus();
  }, [seed]);

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const res = await askOverDocuments({
        question: q,
        document_ids: [documentId],
        top_k: topK,
        min_score: minScore,
      });
      setResult(res);
    } catch (err) {
      setError(classifyUploadError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!indexed) {
    return (
      <EmptyState title="Index this document to ask questions">
        Once indexing finishes, ask a question and get a grounded answer with citations.
      </EmptyState>
    );
  }

  return (
    <div className="ask-panel">
      <textarea
        ref={inputRef}
        className="ask-input"
        placeholder="Ask a question about this document…"
        value={question}
        rows={3}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void ask();
          }
        }}
      />
      <div className="ask-controls">
        <label className="ask-control">
          Top-k
          <input
            type="number"
            min={1}
            max={50}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value) || 8)}
          />
        </label>
        <label className="ask-control">
          Min score
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value) || 0)}
          />
        </label>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void ask()}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </div>

      {busy ? <Spinner label="Retrieving and answering…" /> : null}
      {error ? <ErrorCard error={error} onRetry={() => void ask()} /> : null}

      {result ? (
        <div className="ask-result">
          {result.degraded_reason ? (
            <div className="ask-degraded">
              <strong>{DEGRADED_LABEL[result.degraded_reason] ?? result.degraded_reason}</strong>
              {result.note ? <p className="muted">{result.note}</p> : null}
            </div>
          ) : null}
          {result.answer ? (
            <div className="ask-answer">
              <p className="ask-answer-text">{result.answer}</p>
              <div className="ask-answer-actions">
                {result.model_ref ? (
                  <span className="muted ask-model">{result.model_ref}</span>
                ) : null}
                {onSaveAnswer ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onSaveAnswer(result.answer!, result.run_id)}
                  >
                    Save answer as note
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <details className="ask-context" open>
            <summary>Context used</summary>
            <ContextUsedPanel context={result.context_used} status={result.status} />
          </details>

          {result.chunks.length ? (
            <div className="ask-citations">
              <h4 className="ask-section-title">Citations</h4>
              <CitationsPanel
                chunks={result.chunks}
                onSaveEvidence={
                  onSaveEvidence ? (chunk) => onSaveEvidence(chunk, result.run_id) : undefined
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
