// Singleton around the WebLLM engine. The model (~2 GB for the 3B default) is only downloaded on
// an explicit load — never at boot — and is cached by WebLLM in the Cache API afterwards.
// Without WebGPU the engine reports 'unavailable' and Ask degrades to retrieval-only.
// Import types only — the ~6 MB web-llm library is dynamically imported on the first explicit
// model load so it never weighs down the initial page.
import type { MLCEngineInterface, WebWorkerMLCEngine } from '@mlc-ai/web-llm';

export const DEFAULT_LLM_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
export const FAST_LLM_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
export const LLM_PROVIDER = 'webllm';

export const LLM_MODEL_OPTIONS = [
  { model: DEFAULT_LLM_MODEL, label: 'Llama 3.2 3B (better answers, ~2 GB)' },
  { model: FAST_LLM_MODEL, label: 'Llama 3.2 1B (faster, ~880 MB)' },
];

export type LlmStatus = {
  state: 'idle' | 'unavailable' | 'loading' | 'ready' | 'error';
  model: string;
  /** 0..1 from WebLLM's init progress. */
  progress?: number;
  text?: string;
  error?: string;
};

let status: LlmStatus = { state: 'idle', model: DEFAULT_LLM_MODEL };
const listeners = new Set<(s: LlmStatus) => void>();
let engine: WebWorkerMLCEngine | null = null;
let loadPromise: Promise<MLCEngineInterface> | null = null;
let webGpuProbe: Promise<boolean> | null = null;

function setStatus(next: LlmStatus): void {
  status = next;
  for (const listener of listeners) listener(status);
}

export function getLlmStatus(): LlmStatus {
  return status;
}

export function subscribeLlm(listener: (s: LlmStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export function hasWebGpu(): Promise<boolean> {
  webGpuProbe ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
      return (await gpu.requestAdapter()) != null;
    } catch {
      return false;
    }
  })();
  return webGpuProbe;
}

/** The engine when generation can be used right now; null means degrade to retrieval-only. */
export function engineIfReady(): MLCEngineInterface | null {
  return status.state === 'ready' ? engine : null;
}

export function currentModelRef(): string {
  return `${LLM_PROVIDER}:${status.model}`;
}

export async function loadEngine(model: string = status.model): Promise<MLCEngineInterface> {
  if (!(await hasWebGpu())) {
    setStatus({ state: 'unavailable', model });
    throw new Error('WebGPU is not available in this browser.');
  }
  if (engine && status.state === 'ready') {
    if (status.model === model) return engine;
    setStatus({ state: 'loading', model, progress: 0 });
    await engine.reload(model);
    setStatus({ state: 'ready', model });
    return engine;
  }
  loadPromise ??= (async () => {
    setStatus({ state: 'loading', model, progress: 0 });
    try {
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const created = await CreateWebWorkerMLCEngine(
        new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' }),
        model,
        {
          initProgressCallback: (report) => {
            setStatus({ state: 'loading', model, progress: report.progress, text: report.text });
          },
        },
      );
      engine = created;
      setStatus({ state: 'ready', model });
      return created;
    } catch (err) {
      loadPromise = null;
      setStatus({
        state: 'error',
        model,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  })();
  return loadPromise;
}
