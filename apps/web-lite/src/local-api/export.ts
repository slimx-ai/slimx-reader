// Drop-in for apps/web/lib/api/export.ts: builds the export blob locally instead of asking the
// backend, then reuses the same anchor-click download trick.
import { getDb } from '../db/db';
import { listAnnotations } from './annotations';
import { notFound } from './errors';
import { buildJson, buildMarkdown } from './exportBuilders';
import { listNotes } from './notes';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportBasename(title: string): string {
  return title.replace(/\.[^.]+$/, '').replace(/[^\w\d-]+/g, '-') || 'export';
}

async function loadExportData(documentId: string) {
  const db = await getDb();
  const doc = await db.get('documents', documentId);
  if (!doc) throw notFound();
  const [annotations, notes] = await Promise.all([
    listAnnotations(documentId),
    listNotes(documentId),
  ]);
  return { doc, annotations, notes };
}

export async function exportMarkdown(documentId: string): Promise<void> {
  const { doc, annotations, notes } = await loadExportData(documentId);
  const markdown = buildMarkdown(doc, annotations, notes);
  triggerDownload(
    new Blob([markdown], { type: 'text/markdown' }),
    `${exportBasename(doc.title)}.md`,
  );
}

export async function exportJson(documentId: string): Promise<void> {
  const { doc, annotations, notes } = await loadExportData(documentId);
  const json = JSON.stringify(buildJson(doc, annotations, notes), null, 2);
  triggerDownload(
    new Blob([json], { type: 'application/json' }),
    `${exportBasename(doc.title)}.json`,
  );
}
