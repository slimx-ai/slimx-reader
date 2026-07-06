// Main-thread client for the embedding worker: promise-per-request plus a subscribable status so
// the UI can show the one-time model download.

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_PROVIDER = 'transformers.js';
export const EMBEDDING_DIM = 384;
export const EMBED_BATCH_SIZE = 16;

export type EmbedderStatus = {
  state: 'idle' | 'loading' | 'ready' | 'error';
  /** 0..100 of the file currently downloading, when known. */
  progress?: number;
  error?: string;
};

type Pending = {
  resolve: (vectors: Float32Array[]) => void;
  reject: (err: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let status: EmbedderStatus = { state: 'idle' };
const listeners = new Set<(s: EmbedderStatus) => void>();

function setStatus(next: EmbedderStatus): void {
  status = next;
  for (const listener of listeners) listener(status);
}

export function getEmbedderStatus(): EmbedderStatus {
  return status;
}

export function subscribeEmbedder(listener: (s: EmbedderStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), {
    type: 'module',
  });
  if (status.state === 'idle') setStatus({ state: 'loading' });
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as
      | { type: 'progress'; status?: string; progress?: number }
      | { id: number; buffers?: ArrayBuffer[]; error?: string };
    if ('type' in data && data.type === 'progress') {
      if (data.status === 'progress' && typeof data.progress === 'number') {
        setStatus({ state: 'loading', progress: data.progress });
      } else if (data.status === 'ready') {
        setStatus({ state: 'ready' });
      }
      return;
    }
    if (!('id' in data)) return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.error !== undefined) {
      entry.reject(new Error(data.error));
      return;
    }
    if (status.state !== 'ready') setStatus({ state: 'ready' });
    entry.resolve((data.buffers ?? []).map((b) => new Float32Array(b)));
  };
  worker.onerror = (event) => {
    setStatus({ state: 'error', error: event.message || 'Embedding worker failed.' });
  };
  return worker;
}

/** Embed a batch of texts into L2-normalized MiniLM vectors. */
export function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (!texts.length) return Promise.resolve([]);
  const w = getWorker();
  const id = nextId;
  nextId += 1;
  return new Promise<Float32Array[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, texts });
  });
}

/** Vectors are normalized, so the dot product IS the cosine similarity. */
export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}
