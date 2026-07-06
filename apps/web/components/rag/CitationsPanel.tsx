import { copyText } from '../../lib/clipboard';
import type { RetrievedChunkView } from '../../lib/types';

const LOW_RELEVANCE_THRESHOLD = 0.5;

function sourceTitleOf(chunk: RetrievedChunkView): string {
  const meta = chunk.metadata as { source_title?: unknown };
  if (typeof meta.source_title === 'string' && meta.source_title) return meta.source_title;
  return chunk.citation || `Chunk ${chunk.rank + 1}`;
}

/** Ordered citations with score, a low-relevance badge, and Save-as-evidence. */
export function CitationsPanel({
  chunks,
  onSaveEvidence,
}: {
  chunks: RetrievedChunkView[];
  onSaveEvidence?: (chunk: RetrievedChunkView) => void;
}) {
  if (!chunks.length) return null;
  return (
    <ol className="citations-list">
      {chunks.map((chunk) => (
        <li key={chunk.rag_chunk_id} className="citation-item">
          <div className="citation-item-head">
            <span className="citation-item-title">{sourceTitleOf(chunk)}</span>
            {chunk.page ? <span className="citation-item-meta muted">p. {chunk.page}</span> : null}
            {chunk.section ? (
              <span className="citation-item-meta muted">{chunk.section}</span>
            ) : null}
            <span className="citation-item-score muted">{chunk.score.toFixed(2)}</span>
            {chunk.score < LOW_RELEVANCE_THRESHOLD ? (
              <span className="citation-item-low" title="Low relevance score">
                low relevance
              </span>
            ) : null}
          </div>
          <p className="citation-item-text">{chunk.text}</p>
          <div className="citation-item-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => void copyText(chunk.text)}
            >
              Copy
            </button>
            {onSaveEvidence ? (
              <button type="button" className="text-button" onClick={() => onSaveEvidence(chunk)}>
                Save as evidence
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
