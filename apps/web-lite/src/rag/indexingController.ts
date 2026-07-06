// In-browser replacement for the backend's indexing worker
// (apps/api/app/services/rag/indexing_service.py). Walks the same job states —
// uploaded -> extracting -> chunking -> embedding -> indexing -> ready | failed — writing each
// transition to IndexedDB so the unchanged IndexStatusBadge polling loop just works.
import type { Document, DocumentIndexingStatus, IndexingJob } from '@web/lib/types';
import { getDb, newId, utcnow, type StoredChunk } from '../db/db';
import { chunkDocument } from './chunking';
import {
  EMBED_BATCH_SIZE,
  EMBEDDING_MODEL,
  EMBEDDING_PROVIDER,
  embedTexts,
} from './embeddingClient';

export const VECTOR_BACKEND = 'indexeddb';

const IN_FLIGHT = new Set(['uploaded', 'extracting', 'chunking', 'embedding', 'indexing']);

const running = new Set<string>();

export async function getLatestIndexingJob(documentId: string): Promise<IndexingJob | null> {
  const db = await getDb();
  const jobs = await db.getAllFromIndex('indexing_jobs', 'by_document', documentId);
  if (!jobs.length) return null;
  jobs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return jobs[0];
}

async function putJob(job: IndexingJob): Promise<void> {
  const db = await getDb();
  await db.put('indexing_jobs', job);
}

async function setDocumentIndexingStatus(
  documentId: string,
  status: DocumentIndexingStatus,
  patch: Partial<Document> = {},
): Promise<void> {
  const db = await getDb();
  const doc = await db.get('documents', documentId);
  if (!doc) return;
  await db.put('documents', { ...doc, ...patch, indexing_status: status, updated_at: utcnow() });
}

/** Idempotent: an in-flight job is returned as-is; otherwise a new job starts immediately. */
export async function enqueueIndexing(documentId: string): Promise<IndexingJob> {
  const latest = await getLatestIndexingJob(documentId);
  if (latest && IN_FLIGHT.has(latest.status) && running.has(documentId)) return latest;

  const job: IndexingJob = {
    id: newId(),
    document_id: documentId,
    status: 'uploaded',
    attempt: (latest?.attempt ?? 0) + 1,
    error_reason: null,
    chunk_count: null,
    embedding_provider: null,
    embedding_model: null,
    vector_backend: null,
    rag_index_ref: null,
    trace: {},
    elapsed_ms: null,
    created_at: utcnow(),
    started_at: null,
    finished_at: null,
  };
  await putJob(job);
  await setDocumentIndexingStatus(documentId, 'uploaded');

  running.add(documentId);
  void runJob(job).finally(() => running.delete(documentId));
  return job;
}

async function runJob(job: IndexingJob): Promise<void> {
  const db = await getDb();
  const started = performance.now();
  job.started_at = utcnow();

  const advance = async (status: DocumentIndexingStatus, trace?: Record<string, unknown>) => {
    job.status = status;
    if (trace) job.trace = { ...job.trace, ...trace };
    await putJob({ ...job });
    await setDocumentIndexingStatus(job.document_id, status);
  };

  try {
    await advance('extracting');
    const extracted = await db.get('extracted', job.document_id);
    if (!extracted?.text.trim()) {
      throw new IndexingFailure('no_extractable_text');
    }

    await advance('chunking');
    const drafts = chunkDocument(job.document_id, extracted.text, extracted.pages);
    if (!drafts.length) {
      throw new IndexingFailure('no_extractable_text');
    }

    await advance('embedding', { chunk_total: drafts.length, embedded: 0 });
    const vectors: Float32Array[] = [];
    for (let i = 0; i < drafts.length; i += EMBED_BATCH_SIZE) {
      const batch = drafts.slice(i, i + EMBED_BATCH_SIZE);
      vectors.push(...(await embedTexts(batch.map((d) => d.text))));
      await advance('embedding', { embedded: Math.min(i + EMBED_BATCH_SIZE, drafts.length) });
    }

    await advance('indexing');
    const tx = (await getDb()).transaction('chunks', 'readwrite');
    let cursor = await tx.store.index('by_document').openCursor(job.document_id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    for (let i = 0; i < drafts.length; i += 1) {
      const d = drafts[i];
      const chunk: StoredChunk = {
        id: `${job.document_id}:${d.ordinal}`,
        document_id: job.document_id,
        ordinal: d.ordinal,
        text: d.text,
        page: d.page,
        section: null,
        start_offset: d.start_offset,
        end_offset: d.end_offset,
        parent_id: d.parent_id,
        token_count: d.token_count,
        embedding: vectors[i].buffer as ArrayBuffer,
      };
      await tx.store.put(chunk);
    }
    await tx.done;

    job.chunk_count = drafts.length;
    job.embedding_provider = EMBEDDING_PROVIDER;
    job.embedding_model = EMBEDDING_MODEL;
    job.vector_backend = VECTOR_BACKEND;
    job.rag_index_ref = `${VECTOR_BACKEND}:${job.document_id}`;
    job.elapsed_ms = Math.round(performance.now() - started);
    job.finished_at = utcnow();
    job.status = 'ready';
    await putJob({ ...job });
    await setDocumentIndexingStatus(job.document_id, 'ready', {
      rag_index_ref: job.rag_index_ref,
    });
  } catch (err) {
    job.error_reason =
      err instanceof IndexingFailure
        ? err.message
        : `indexing_error: ${err instanceof Error ? err.message : String(err)}`;
    job.elapsed_ms = Math.round(performance.now() - started);
    job.finished_at = utcnow();
    job.status = 'failed';
    await putJob({ ...job });
    await setDocumentIndexingStatus(job.document_id, 'failed');
  }
}

class IndexingFailure extends Error {}
