// documentFileUrl() must stay synchronous (PdfViewer receives it as a plain prop during render),
// so blob URLs are minted ahead of time: DocumentReader always awaits getDocument() before
// rendering the viewer, and getDocument() populates this cache.
import { getDb } from '../db/db';
import { notFound } from './errors';

const urls = new Map<string, string>();

export async function ensureFileUrl(documentId: string): Promise<void> {
  if (urls.has(documentId)) return;
  const db = await getDb();
  const file = await db.get('files', documentId);
  if (!file) return;
  const blob = new Blob([file.data], { type: file.mime_type ?? 'application/octet-stream' });
  urls.set(documentId, URL.createObjectURL(blob));
}

export function revokeFileUrl(documentId: string): void {
  const url = urls.get(documentId);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(documentId);
  }
}

/** Blob URL of a document's stored bytes (same call signature as the HTTP version). */
export function documentFileUrl(documentId: string): string {
  const url = urls.get(documentId);
  if (!url) throw notFound('Document file');
  return url;
}
