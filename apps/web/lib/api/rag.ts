import type {
  AskRequest,
  AskResponse,
  DocumentChunksResponse,
  IndexingJob,
  ModelOption,
  ModelsHealth,
  RagHealth,
} from '../types';
import { apiFetch } from './http';

export async function askOverDocuments(payload: AskRequest): Promise<AskResponse> {
  return apiFetch<AskResponse>('/api/rag/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRagHealth(): Promise<RagHealth> {
  return apiFetch<RagHealth>('/api/rag/health');
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

export async function getModelsHealth(): Promise<ModelsHealth> {
  return apiFetch<ModelsHealth>('/api/models/health');
}

export async function listModels(): Promise<ModelOption[]> {
  const res = await apiFetch<{ models: ModelOption[] }>('/api/models/list');
  return res.models;
}
