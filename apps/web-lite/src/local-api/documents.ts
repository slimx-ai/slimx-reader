// IndexedDB-backed replacement for apps/web/lib/api/documents.ts, mirroring the upload semantics
// of apps/api/app/services/documents.py::create_document: store bytes, best-effort extraction
// (a scanned PDF never blocks the upload), then enqueue indexing.
import type { Document, DocumentContent, DocumentList } from '@web/lib/types';
import { getDb, newId, sha256Hex, utcnow } from '../db/db';
import {
  detectSourceType,
  ExtractionError,
  extractText,
  isSupportedDocument,
} from '../extraction';
import { enqueueIndexing } from '../rag/indexingController';
import { ApiError, notFound } from './errors';
import { ensureFileUrl, revokeFileUrl } from './fileUrls';

export const MAX_UPLOAD_MB = 50;

export async function listDocuments(params?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<DocumentList> {
  const db = await getDb();
  let docs = await db.getAll('documents');
  const q = params?.q?.trim().toLowerCase();
  if (q) {
    docs = docs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q),
    );
  }
  docs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 50;
  return { items: docs.slice(offset, offset + limit), total: docs.length, limit, offset };
}

export async function getDocument(documentId: string): Promise<Document> {
  const db = await getDb();
  const doc = await db.get('documents', documentId);
  if (!doc) throw notFound();
  await ensureFileUrl(documentId);
  return doc;
}

export async function getDocumentContent(documentId: string): Promise<DocumentContent> {
  const db = await getDb();
  const doc = await db.get('documents', documentId);
  if (!doc) throw notFound();
  const extracted = await db.get('extracted', documentId);
  const text = extracted?.text ?? '';
  return {
    document_id: documentId,
    source_type: doc.source_type,
    text,
    available: text.trim().length > 0,
  };
}

export async function uploadDocument(file: File): Promise<Document> {
  if (!isSupportedDocument(file.name, file.type || null)) {
    throw new ApiError(`Unsupported document type: ${file.name}`, {
      status: 415,
      code: 'unsupported_type',
    });
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new ApiError(`File exceeds the maximum upload size (${MAX_UPLOAD_MB} MB).`, {
      status: 413,
      code: 'file_too_large',
    });
  }

  const data = await file.arrayBuffer();
  const now = utcnow();
  const doc: Document = {
    id: newId(),
    title: file.name,
    filename: file.name,
    mime_type: file.type || null,
    source_type: null,
    content_hash: await sha256Hex(data),
    file_size: file.size,
    page_count: null,
    status: 'uploaded',
    indexing_status: 'not_indexed',
    rag_index_ref: null,
    metadata: {},
    created_at: now,
    updated_at: now,
  };

  // Best-effort extraction — a failure (e.g. scanned PDF) never blocks the upload; indexing will
  // report a precise reason later.
  let text = '';
  let pages = null;
  try {
    const extraction = await extractText(file.name, file.type || null, data);
    doc.source_type = extraction.sourceType;
    doc.page_count = extraction.pageCount;
    text = extraction.text;
    pages = extraction.pages;
  } catch (err) {
    doc.source_type = doc.source_type ?? null;
    if (err instanceof ExtractionError) doc.page_count = err.pageCount;
  }
  if (!doc.source_type) {
    doc.source_type = detectSourceType(file.name, file.type || null);
  }
  doc.status = text.trim() ? 'parsed' : 'uploaded';

  const db = await getDb();
  await db.put('files', {
    document_id: doc.id,
    filename: file.name,
    mime_type: file.type || null,
    data,
  });
  if (text.trim()) {
    await db.put('extracted', { document_id: doc.id, text, pages });
  }
  await db.put('documents', doc);

  const job = await enqueueIndexing(doc.id);
  return { ...doc, indexing_status: job.status as Document['indexing_status'] };
}

export async function deleteDocument(documentId: string): Promise<void> {
  const db = await getDb();
  revokeFileUrl(documentId);
  const tx = db.transaction(
    ['documents', 'files', 'extracted', 'annotations', 'notes', 'chunks', 'indexing_jobs'],
    'readwrite',
  );
  await tx.objectStore('documents').delete(documentId);
  await tx.objectStore('files').delete(documentId);
  await tx.objectStore('extracted').delete(documentId);
  for (const store of ['annotations', 'notes', 'chunks', 'indexing_jobs'] as const) {
    let cursor = await tx.objectStore(store).index('by_document').openCursor(documentId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}
