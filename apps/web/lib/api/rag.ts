import type { AskRequest, AskResponse, DocumentChunksResponse, IndexingJob } from '../types';
import { apiFetch } from './http';

export async function askOverDocuments(payload: AskRequest): Promise<AskResponse> {
  return apiFetch<AskResponse>('/api/rag/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function indexDocument(documentId: string): Promise<IndexingJob> {
  return apiFetch<IndexingJob>(`/api/documents/${documentId}/index`, { method: 'POST' });
}

export async function getIndexingJob(documentId: string): Promise<IndexingJob | null> {
  return apiFetch<IndexingJob | null>(`/api/documents/${documentId}/indexing-job`);
}

export async function listDocumentChunks(documentId: string): Promise<DocumentChunksResponse> {
  return apiFetch<DocumentChunksResponse>(`/api/documents/${documentId}/chunks`);
}
