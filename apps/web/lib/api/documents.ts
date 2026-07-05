import type { Document, DocumentContent, DocumentList } from '../types';
import { apiFetch } from './http';

export async function listDocuments(params?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<DocumentList> {
  const search = new URLSearchParams();
  if (params?.q) search.set('q', params.q);
  if (params?.limit != null) search.set('limit', String(params.limit));
  if (params?.offset != null) search.set('offset', String(params.offset));
  const qs = search.toString();
  return apiFetch<DocumentList>(`/api/documents${qs ? `?${qs}` : ''}`);
}

export async function getDocument(documentId: string): Promise<Document> {
  return apiFetch<Document>(`/api/documents/${documentId}`);
}

export async function getDocumentContent(documentId: string): Promise<DocumentContent> {
  return apiFetch<DocumentContent>(`/api/documents/${documentId}/content`);
}

export async function uploadDocument(file: File): Promise<Document> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch<Document>('/api/documents/upload', { method: 'POST', body: form });
}

export async function deleteDocument(documentId: string): Promise<void> {
  await apiFetch<void>(`/api/documents/${documentId}`, { method: 'DELETE' });
}
