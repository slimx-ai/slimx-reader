// Drop-in for apps/web/lib/api/rag.ts: indexing runs in the in-page controller, retrieval and
// grounded answers in src/rag/ask.ts, and the health endpoints answer statically for the
// in-browser stack.
import type {
  AskRequest,
  AskResponse,
  DocumentChunk,
  DocumentChunksResponse,
  IndexingJob,
} from '@web/lib/types';
import { getDb } from '../db/db';
import { ask } from '../rag/ask';
import { enqueueIndexing, getLatestIndexingJob } from '../rag/indexingController';
import { notFound } from './errors';

export { ask as askOverDocumentsStreaming } from '../rag/ask';

export async function askOverDocuments(payload: AskRequest): Promise<AskResponse> {
  return ask(payload);
}

export async function indexDocument(documentId: string): Promise<IndexingJob> {
  const db = await getDb();
  const doc = await db.get('documents', documentId);
  if (!doc) throw notFound();
  return enqueueIndexing(documentId);
}

export async function getIndexingJob(documentId: string): Promise<IndexingJob | null> {
  return getLatestIndexingJob(documentId);
}

export async function listDocumentChunks(documentId: string): Promise<DocumentChunksResponse> {
  const db = await getDb();
  const doc = await db.get('documents', documentId);
  if (!doc) throw notFound();
  const stored = await db.getAllFromIndex('chunks', 'by_document', documentId);
  if (!stored.length) {
    return { document_id: documentId, status: 'not_indexed', chunk_count: 0, chunks: [] };
  }
  stored.sort((a, b) => a.ordinal - b.ordinal);
  const chunks: DocumentChunk[] = stored.map((c) => ({
    rag_chunk_id: c.id,
    ordinal: c.ordinal,
    text: c.text,
    page: c.page,
    section: c.section,
    start_offset: c.start_offset,
    end_offset: c.end_offset,
    section_path: null,
    parent_id: c.parent_id,
    page_type: null,
    token_count: c.token_count,
  }));
  return { document_id: documentId, status: 'ready', chunk_count: chunks.length, chunks };
}
