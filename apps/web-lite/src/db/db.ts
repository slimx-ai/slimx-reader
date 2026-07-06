// All persistence for the browser-only reader lives in one IndexedDB database. This replaces the
// backend's SQLite + local file storage; model weights are NOT stored here (Transformers.js and
// WebLLM cache those in the Cache API themselves).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Annotation,
  ContextUsed,
  Document,
  IndexingJob,
  Note,
  RetrievedChunkView,
} from '@web/lib/types';

export type PageSpan = { page: number; start: number; end: number };

export type StoredFile = {
  document_id: string;
  filename: string;
  mime_type: string | null;
  data: ArrayBuffer;
};

export type StoredExtraction = {
  document_id: string;
  text: string;
  pages: PageSpan[] | null;
};

export type StoredChunk = {
  id: string; // `${document_id}:${ordinal}`
  document_id: string;
  ordinal: number;
  text: string;
  page: number | null;
  section: string | null;
  start_offset: number | null;
  end_offset: number | null;
  parent_id: string | null;
  token_count: number;
  embedding: ArrayBuffer; // Float32Array(384), L2-normalized
};

export type StoredRetrievalRun = {
  id: string;
  question: string;
  document_ids: string[] | null;
  top_k: number;
  min_score: number;
  status: 'started' | 'succeeded' | 'insufficient_context' | 'failed';
  answer: string | null;
  model_ref: string | null;
  context_snapshot: Record<string, unknown> | null;
  context_used: ContextUsed;
  chunks: RetrievedChunkView[];
  elapsed_ms: number | null;
  created_at: string;
};

interface ReaderLiteDB extends DBSchema {
  documents: { key: string; value: Document };
  files: { key: string; value: StoredFile };
  extracted: { key: string; value: StoredExtraction };
  annotations: { key: string; value: Annotation; indexes: { by_document: string } };
  notes: { key: string; value: Note; indexes: { by_document: string } };
  chunks: { key: string; value: StoredChunk; indexes: { by_document: string } };
  indexing_jobs: { key: string; value: IndexingJob; indexes: { by_document: string } };
  retrieval_runs: { key: string; value: StoredRetrievalRun };
  settings: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<ReaderLiteDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ReaderLiteDB>> {
  dbPromise ??= openDB<ReaderLiteDB>('slimx-reader-lite', 1, {
    upgrade(db) {
      db.createObjectStore('documents', { keyPath: 'id' });
      db.createObjectStore('files', { keyPath: 'document_id' });
      db.createObjectStore('extracted', { keyPath: 'document_id' });
      db.createObjectStore('annotations', { keyPath: 'id' }).createIndex(
        'by_document',
        'document_id',
      );
      db.createObjectStore('notes', { keyPath: 'id' }).createIndex('by_document', 'document_id');
      db.createObjectStore('chunks', { keyPath: 'id' }).createIndex('by_document', 'document_id');
      db.createObjectStore('indexing_jobs', { keyPath: 'id' }).createIndex(
        'by_document',
        'document_id',
      );
      db.createObjectStore('retrieval_runs', { keyPath: 'id' });
      db.createObjectStore('settings');
    },
  });
  return dbPromise;
}

export function utcnow(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  // Wrap in a view: webcrypto rejects ArrayBuffers from another realm (e.g. jsdom's FileReader
  // under Node 20), but TypedArray views are accepted everywhere.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
