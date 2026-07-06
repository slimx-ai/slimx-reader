// Straight IndexedDB CRUD — the backend never computed anything for annotations, it only stored
// them, so this is a drop-in for apps/web/lib/api/annotations.ts.
import type { Annotation, AnnotationCreate } from '@web/lib/types';
import { getDb, newId, utcnow } from '../db/db';
import { notFound } from './errors';

export async function listAnnotations(documentId: string): Promise<Annotation[]> {
  const db = await getDb();
  const items = await db.getAllFromIndex('annotations', 'by_document', documentId);
  items.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return items;
}

export async function createAnnotation(
  documentId: string,
  payload: AnnotationCreate,
): Promise<Annotation> {
  const now = utcnow();
  const annotation: Annotation = {
    id: newId(),
    document_id: documentId,
    type: payload.type,
    quote: payload.quote,
    start_offset: payload.start_offset ?? null,
    end_offset: payload.end_offset ?? null,
    page: payload.page ?? null,
    color: payload.color ?? null,
    body: payload.body ?? null,
    labels: payload.labels ?? [],
    pdf_anchor: payload.pdf_anchor ?? null,
    created_at: now,
    updated_at: now,
  };
  const db = await getDb();
  await db.put('annotations', annotation);
  return annotation;
}

export async function updateAnnotation(
  annotationId: string,
  payload: Partial<AnnotationCreate>,
): Promise<Annotation> {
  const db = await getDb();
  const existing = await db.get('annotations', annotationId);
  if (!existing) throw notFound('Annotation');
  const updated: Annotation = {
    ...existing,
    ...(payload.type !== undefined ? { type: payload.type } : {}),
    ...(payload.quote !== undefined ? { quote: payload.quote } : {}),
    ...(payload.start_offset !== undefined ? { start_offset: payload.start_offset } : {}),
    ...(payload.end_offset !== undefined ? { end_offset: payload.end_offset } : {}),
    ...(payload.page !== undefined ? { page: payload.page } : {}),
    ...(payload.color !== undefined ? { color: payload.color } : {}),
    ...(payload.body !== undefined ? { body: payload.body } : {}),
    ...(payload.labels !== undefined ? { labels: payload.labels ?? [] } : {}),
    ...(payload.pdf_anchor !== undefined ? { pdf_anchor: payload.pdf_anchor } : {}),
    updated_at: utcnow(),
  };
  await db.put('annotations', updated);
  return updated;
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  const db = await getDb();
  await db.delete('annotations', annotationId);
}
