// Web Worker running the Transformers.js feature-extraction pipeline (MiniLM). Kept off the main
// thread so embedding a large document never janks the reader. Weights (~23 MB quantized) are
// downloaded once and cached by the browser's Cache API.
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

type EmbedRequest = { id: number; texts: string[] };

let embedderPromise: Promise<FeatureExtractionPipeline> | null = null;

// pipeline()'s task-union overloads blow TS's union-size limit (TS2590); a narrowed signature
// keeps the call site typed without `any`.
const createPipeline = pipeline as unknown as (
  task: 'feature-extraction',
  model: string,
  options: {
    dtype: string;
    progress_callback: (info: { status?: string; file?: string; progress?: number }) => void;
  },
) => Promise<FeatureExtractionPipeline>;

function getEmbedder(): Promise<FeatureExtractionPipeline> {
  embedderPromise ??= createPipeline('feature-extraction', EMBEDDING_MODEL, {
    dtype: 'q8',
    progress_callback: (info) => {
      self.postMessage({
        type: 'progress',
        status: info.status,
        file: info.file,
        progress: info.progress,
      });
    },
  });
  return embedderPromise;
}

self.onmessage = async (event: MessageEvent<EmbedRequest>) => {
  const { id, texts } = event.data;
  try {
    const embedder = await getEmbedder();
    const output = await embedder(texts, { pooling: 'mean', normalize: true });
    const [count, dim] = output.dims as [number, number];
    const data = output.data as Float32Array;
    const buffers: ArrayBuffer[] = [];
    for (let i = 0; i < count; i += 1) {
      buffers.push(data.slice(i * dim, (i + 1) * dim).buffer as ArrayBuffer);
    }
    self.postMessage({ id, buffers, dim }, { transfer: buffers });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
