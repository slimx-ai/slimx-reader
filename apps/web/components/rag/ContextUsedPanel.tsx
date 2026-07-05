import type { ContextUsed } from '../../lib/types';

/** Retrieval transparency: exactly what grounded the answer (chunks, budget, embedder, latency). */
export function ContextUsedPanel({
  context,
  status,
}: {
  context: ContextUsed;
  status: string;
}) {
  if (status === 'insufficient_context') {
    return (
      <p className="context-used-note muted">
        No sufficiently relevant context was retrieved for this question.
      </p>
    );
  }
  const rows: Array<[string, string]> = [];
  if (context.chunks_used != null) rows.push(['Chunks used', String(context.chunks_used)]);
  if (context.top_k != null) rows.push(['Top-k', String(context.top_k)]);
  if (context.min_score != null) rows.push(['Min score', String(context.min_score)]);
  if (context.chars_sent != null) rows.push(['Chars sent', String(context.chars_sent)]);
  if (context.embedding_provider) {
    rows.push([
      'Embedder',
      `${context.embedding_provider}${context.embedding_model ? ` · ${context.embedding_model}` : ''}`,
    ]);
  }
  if (context.vector_backend) rows.push(['Vector backend', context.vector_backend]);
  if (context.elapsed_ms != null) rows.push(['Latency', `${context.elapsed_ms} ms`]);
  if (!rows.length) return null;

  return (
    <dl className="context-used">
      {rows.map(([label, value]) => (
        <div key={label} className="context-used-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
