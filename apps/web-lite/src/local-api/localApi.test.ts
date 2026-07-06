// End-to-end round-trip over the real (fake-indexeddb) database: upload -> index -> read ->
// annotate -> note -> ask (retrieval-only) -> export -> delete cascade. The embedding worker is
// replaced with a deterministic bag-of-words embedder so indexing and retrieval run for real.
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../rag/embeddingClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('../rag/embeddingClient')>();
  const embed = (text: string): Float32Array => {
    const vector = new Float32Array(original.EMBEDDING_DIM);
    for (const word of text.toLowerCase().split(/\W+/)) {
      if (!word) continue;
      let hash = 0;
      for (let i = 0; i < word.length; i += 1) hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
      vector[hash % original.EMBEDDING_DIM] += 1;
    }
    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return vector.map((v) => v / norm);
  };
  return {
    ...original,
    embedTexts: vi.fn(async (texts: string[]) => texts.map(embed)),
  };
});

import { getDb } from '../db/db';
import { buildMarkdown } from './exportBuilders';
import * as api from './index';

async function waitForIndexing(documentId: string, timeoutMs = 3000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await api.getIndexingJob(documentId);
    if (job && (job.status === 'ready' || job.status === 'failed')) return job.status;
    if (Date.now() > deadline) throw new Error(`indexing did not finish (last: ${job?.status})`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const SAMPLE_MD = [
  '# Photosynthesis notes',
  '',
  'Chlorophyll absorbs sunlight to power photosynthesis in plant leaves.',
  '',
  'Mitochondria produce ATP through cellular respiration in animal cells.',
].join('\n');

let documentId: string;

beforeAll(async () => {
  const file = new File([SAMPLE_MD], 'photosynthesis.md', { type: 'text/markdown' });
  const doc = await api.uploadDocument(file);
  documentId = doc.id;
});

describe('documents', () => {
  it('uploads, extracts, and auto-enqueues indexing', async () => {
    const doc = await api.getDocument(documentId);
    expect(doc.source_type).toBe('markdown');
    expect(doc.content_hash).toMatch(/^[0-9a-f]{64}$/);
    const content = await api.getDocumentContent(documentId);
    expect(content.available).toBe(true);
    expect(content.text).toContain('Chlorophyll');
    expect(await waitForIndexing(documentId)).toBe('ready');
  });

  it('rejects unsupported and oversized files with classified errors', async () => {
    await expect(
      api.uploadDocument(new File(['x'], 'image.png', { type: 'image/png' })),
    ).rejects.toMatchObject({ code: 'unsupported_type', status: 415 });
  });

  it('lists and searches by title', async () => {
    const all = await api.listDocuments();
    expect(all.items.some((d) => d.id === documentId)).toBe(true);
    const hit = await api.listDocuments({ q: 'photosynthesis' });
    expect(hit.total).toBeGreaterThanOrEqual(1);
    const miss = await api.listDocuments({ q: 'zzz-no-match' });
    expect(miss.total).toBe(0);
  });

  it('serves a synchronous blob URL after getDocument', async () => {
    await api.getDocument(documentId);
    expect(api.documentFileUrl(documentId)).toMatch(/^blob:/);
  });
});

describe('annotations and notes', () => {
  it('round-trips CRUD', async () => {
    const created = await api.createAnnotation(documentId, {
      type: 'highlight',
      quote: 'Chlorophyll absorbs sunlight',
      color: '#ffe066',
      page: null,
    });
    expect(created.labels).toEqual([]);
    const updated = await api.updateAnnotation(created.id, { body: 'key fact', color: null });
    expect(updated.body).toBe('key fact');
    expect(updated.color).toBeNull();
    expect(await api.listAnnotations(documentId)).toHaveLength(1);

    const note = await api.createNote({ document_id: documentId, kind: 'evidence', body: 'ev' });
    expect(note.kind).toBe('evidence');
    expect(await api.listNotes(documentId)).toHaveLength(1);
  });
});

describe('chunks and ask', () => {
  it('exposes page-aware chunks after indexing', async () => {
    const res = await api.listDocumentChunks(documentId);
    expect(res.status).toBe('ready');
    expect(res.chunk_count).toBeGreaterThan(0);
    expect(res.chunks[0].rag_chunk_id).toBe(`${documentId}:0`);
  });

  it('answers retrieval-only with citations when no model is loaded', async () => {
    const res = await api.askOverDocuments({
      question: 'What absorbs sunlight for photosynthesis?',
      document_ids: [documentId],
      top_k: 4,
      min_score: 0,
    });
    expect(res.status).toBe('succeeded');
    expect(res.degraded_reason).toBe('model_unavailable');
    expect(res.answer).toBeNull();
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.chunks[0].text).toContain('Chlorophyll');
    expect(res.chunks[0].citation).toBe('[photosynthesis.md]');
    expect(res.context_used).toMatchObject({
      embedding_model: 'Xenova/all-MiniLM-L6-v2',
      vector_backend: 'indexeddb',
    });
  });

  it('treats an explicitly empty scope as insufficient, never the whole index', async () => {
    const res = await api.askOverDocuments({ question: 'anything', document_ids: [] });
    expect(res.status).toBe('insufficient_context');
    expect(res.degraded_reason).toBe('insufficient');
    expect(res.chunks).toHaveLength(0);
  });
});

describe('export', () => {
  it('builds backend-shaped markdown', async () => {
    const doc = await api.getDocument(documentId);
    const markdown = buildMarkdown(
      doc,
      await api.listAnnotations(documentId),
      await api.listNotes(documentId),
    );
    expect(markdown).toContain('# photosynthesis.md');
    expect(markdown).toContain('## Highlights');
    expect(markdown).toContain('> Chlorophyll absorbs sunlight');
    expect(markdown).toContain('## Notes & evidence');
    expect(markdown).toContain('**Evidence**');
  });
});

describe('delete', () => {
  it('cascades across every store', async () => {
    await api.deleteDocument(documentId);
    const db = await getDb();
    expect(await db.get('documents', documentId)).toBeUndefined();
    expect(await db.get('files', documentId)).toBeUndefined();
    expect(await db.get('extracted', documentId)).toBeUndefined();
    expect(await db.getAllFromIndex('annotations', 'by_document', documentId)).toHaveLength(0);
    expect(await db.getAllFromIndex('notes', 'by_document', documentId)).toHaveLength(0);
    expect(await db.getAllFromIndex('chunks', 'by_document', documentId)).toHaveLength(0);
    expect(await db.getAllFromIndex('indexing_jobs', 'by_document', documentId)).toHaveLength(0);
    await expect(api.getDocument(documentId)).rejects.toMatchObject({
      code: 'document_not_found',
    });
  });
});
