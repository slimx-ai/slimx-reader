// TS port of apps/api/app/services/export_service.py — same headings, ordering, and "grounded"
// markers so a lite export matches a backend export byte-for-byte given the same data.
import type { Annotation, Document, Note } from '@web/lib/types';

export function buildJson(
  document: Document,
  annotations: Annotation[],
  notes: Note[],
): Record<string, unknown> {
  return {
    document: {
      id: document.id,
      title: document.title,
      filename: document.filename,
      source_type: document.source_type,
      page_count: document.page_count,
      indexing_status: document.indexing_status,
    },
    annotations: annotations.map((a) => ({
      type: a.type,
      quote: a.quote,
      body: a.body,
      page: a.page,
      labels: a.labels,
      created_at: a.created_at,
    })),
    notes: notes.map((n) => ({
      kind: n.kind,
      body: n.body,
      grounded: n.retrieval_run_id !== null,
      created_at: n.created_at,
    })),
  };
}

export function buildMarkdown(
  document: Document,
  annotations: Annotation[],
  notes: Note[],
): string {
  const lines: string[] = [`# ${document.title}`, ''];
  lines.push(`_Source: ${document.filename}_`);
  if (document.page_count) lines.push(`_Pages: ${document.page_count}_`);
  lines.push('');

  const highlights = annotations.filter((a) => a.type === 'highlight');
  const comments = annotations.filter((a) => a.type === 'comment');

  if (highlights.length) {
    lines.push('## Highlights', '');
    for (const a of highlights) {
      const page = a.page ? ` (p. ${a.page})` : '';
      lines.push(`> ${a.quote}${page}`, '');
    }
  }

  if (comments.length) {
    lines.push('## Comments', '');
    for (const a of comments) {
      const page = a.page ? ` (p. ${a.page})` : '';
      lines.push(`> ${a.quote}${page}`);
      if (a.body) lines.push(`\n${a.body}`);
      lines.push('');
    }
  }

  if (notes.length) {
    lines.push('## Notes & evidence', '');
    for (const n of notes) {
      const tag = n.kind === 'evidence' ? 'Evidence' : n.kind.charAt(0).toUpperCase() + n.kind.slice(1);
      const grounded = n.retrieval_run_id ? ' · grounded' : '';
      lines.push(`**${tag}${grounded}**`, '', n.body, '');
    }
  }

  if (!highlights.length && !comments.length && !notes.length) {
    lines.push('_No annotations or notes yet._');
  }

  return `${lines.join('\n').replace(/\s+$/, '')}\n`;
}
