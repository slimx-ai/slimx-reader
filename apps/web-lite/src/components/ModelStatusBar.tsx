// App-level strip showing where the in-browser stack stands: WebGPU availability, the embedding
// model (auto-downloaded ~23 MB on first index), the answer model (explicit ~2 GB / ~880 MB
// download), and how much storage the origin uses.
import { useEffect, useState } from 'react';
import {
  getEmbedderStatus,
  subscribeEmbedder,
  type EmbedderStatus,
} from '../rag/embeddingClient';
import {
  DEFAULT_LLM_MODEL,
  getLlmStatus,
  hasWebGpu,
  LLM_MODEL_OPTIONS,
  loadEngine,
  subscribeLlm,
  type LlmStatus,
} from '../llm/engineManager';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ModelStatusBar() {
  const [embedder, setEmbedder] = useState<EmbedderStatus>(getEmbedderStatus());
  const [llm, setLlm] = useState<LlmStatus>(getLlmStatus());
  const [webGpu, setWebGpu] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [model, setModel] = useState(DEFAULT_LLM_MODEL);

  useEffect(() => subscribeEmbedder(setEmbedder), []);
  useEffect(() => subscribeLlm(setLlm), []);
  useEffect(() => {
    void hasWebGpu().then(setWebGpu);
  }, []);
  useEffect(() => {
    const update = () =>
      void navigator.storage
        ?.estimate?.()
        .then((estimate) => setUsage(estimate.usage ?? null))
        .catch(() => undefined);
    update();
    const timer = setInterval(update, 10000);
    return () => clearInterval(timer);
  }, []);

  const embedderLabel =
    embedder.state === 'ready'
      ? 'ready'
      : embedder.state === 'loading'
        ? embedder.progress != null
          ? `downloading ${Math.round(embedder.progress)}%`
          : 'loading…'
        : embedder.state === 'error'
          ? 'failed'
          : 'on first index';

  return (
    <div className="model-status-bar">
      <span className="model-status-title">100% in-browser — nothing leaves this tab</span>
      <span className="model-status-item muted">
        Search embeddings: <strong>{embedderLabel}</strong>
      </span>
      <span className="model-status-item muted">
        Answers:{' '}
        {webGpu === false ? (
          <strong>unavailable (no WebGPU)</strong>
        ) : llm.state === 'ready' ? (
          <strong>{llm.model}</strong>
        ) : llm.state === 'loading' ? (
          <strong>downloading {Math.round((llm.progress ?? 0) * 100)}%</strong>
        ) : llm.state === 'error' ? (
          <strong>failed — {llm.error}</strong>
        ) : (
          <>
            <select
              className="model-status-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="Answer model"
            >
              {LLM_MODEL_OPTIONS.map((option) => (
                <option key={option.model} value={option.model}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary-button model-status-load"
              onClick={() => void loadEngine(model)}
            >
              Load
            </button>
          </>
        )}
      </span>
      {usage !== null ? (
        <span className="model-status-item muted">Storage: {formatBytes(usage)}</span>
      ) : null}
    </div>
  );
}
