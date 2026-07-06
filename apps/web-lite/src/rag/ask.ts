// In-browser port of apps/api/app/services/rag/qa_service.py: retrieve (MiniLM cosine over the
// IndexedDB chunk store), persist the run, pack a grounded prompt, and optionally generate a
// cited answer with WebLLM — degrading to retrieval-only when no model is available. Never
// fabricates an ungrounded answer.
import type { AskRequest, AskResponse, RetrievedChunkView } from '@web/lib/types';
import { getDb, newId, utcnow, type StoredRetrievalRun } from '../db/db';
import { currentModelRef, engineIfReady } from '../llm/engineManager';
import { dot, EMBEDDING_MODEL, EMBEDDING_PROVIDER, embedTexts } from './embeddingClient';
import { VECTOR_BACKEND } from './indexingController';
import { buildPrompt, FAILED_NOTE, INSUFFICIENT_NOTE } from './promptBuilding';

const MODEL_UNAVAILABLE_NOTE =
  'No model available — showing retrieved context. Load the in-browser model from the status ' +
  'bar (WebGPU required) to get generated answers.';

async function saveRun(run: StoredRetrievalRun): Promise<void> {
  const db = await getDb();
  await db.put('retrieval_runs', run);
}

function toResponse(run: StoredRetrievalRun, degradedReason: string | null, note: string | null): AskResponse {
  return {
    run_id: run.id,
    status: run.status,
    answer: run.answer,
    model_ref: run.model_ref,
    degraded_reason: degradedReason,
    note,
    context_used: run.context_used,
    chunks: run.chunks,
  };
}

async function retrieve(
  question: string,
  documentIds: string[] | null,
  topK: number,
  minScore: number,
): Promise<RetrievedChunkView[]> {
  const db = await getDb();
  const [queryVector] = await embedTexts([question]);

  const chunks =
    documentIds === null
      ? await db.getAll('chunks')
      : (
          await Promise.all(
            documentIds.map((id) => db.getAllFromIndex('chunks', 'by_document', id)),
          )
        ).flat();

  const titles = new Map<string, string>();
  const scored = chunks
    .map((chunk) => ({ chunk, score: dot(queryVector, new Float32Array(chunk.embedding)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((entry) => entry.score >= minScore);

  const views: RetrievedChunkView[] = [];
  for (let rank = 0; rank < scored.length; rank += 1) {
    const { chunk, score } = scored[rank];
    if (!titles.has(chunk.document_id)) {
      const doc = await db.get('documents', chunk.document_id);
      titles.set(chunk.document_id, doc?.title ?? 'Untitled');
    }
    const title = titles.get(chunk.document_id)!;
    const citation = chunk.page !== null ? `[${title}, p. ${chunk.page}]` : `[${title}]`;
    views.push({
      rag_chunk_id: chunk.id,
      document_id: chunk.document_id,
      rank,
      score,
      text: chunk.text,
      page: chunk.page,
      section: chunk.section,
      citation,
      metadata: { citation, parent_id: chunk.parent_id ?? undefined },
    });
  }
  return views;
}

/**
 * Ask a grounded question. When `onToken` is provided and the WebLLM engine is ready, answer
 * tokens stream through it before the final response resolves.
 */
export async function ask(
  payload: AskRequest,
  onToken?: (delta: string, answerSoFar: string) => void,
): Promise<AskResponse> {
  const started = performance.now();
  const documentIds = payload.document_ids ?? null;
  const topK = payload.top_k ?? 8;
  const minScore = payload.min_score ?? 0;
  const generate = payload.generate ?? true;

  const run: StoredRetrievalRun = {
    id: newId(),
    question: payload.question,
    document_ids: documentIds,
    top_k: topK,
    min_score: minScore,
    status: 'started',
    answer: null,
    model_ref: null,
    context_snapshot: null,
    context_used: {},
    chunks: [],
    elapsed_ms: null,
    created_at: utcnow(),
  };

  // Explicit-empty-scope guard: an empty document filter must never widen to the whole index.
  if (documentIds !== null && documentIds.length === 0) {
    run.status = 'insufficient_context';
    await saveRun(run);
    return toResponse(run, 'insufficient', INSUFFICIENT_NOTE);
  }

  try {
    run.chunks = await retrieve(payload.question, documentIds, topK, minScore);
  } catch (err) {
    run.status = 'failed';
    run.elapsed_ms = Math.round(performance.now() - started);
    await saveRun(run);
    return toResponse(run, 'failed', `${FAILED_NOTE} (${err instanceof Error ? err.message : err})`);
  }

  run.elapsed_ms = Math.round(performance.now() - started);
  if (!run.chunks.length) {
    run.status = 'insufficient_context';
    await saveRun(run);
    return toResponse(run, 'insufficient', INSUFFICIENT_NOTE);
  }
  run.status = 'succeeded';

  const prompt = buildPrompt(payload.question, run.chunks);
  run.context_snapshot = prompt.snapshot as unknown as Record<string, unknown>;
  run.context_used = {
    chunks_used: run.chunks.length,
    top_k: topK,
    min_score: minScore,
    chars_sent: prompt.snapshot.total_chars,
    embedding_provider: EMBEDDING_PROVIDER,
    embedding_model: EMBEDDING_MODEL,
    vector_backend: VECTOR_BACKEND,
    elapsed_ms: run.elapsed_ms,
  };

  if (!generate) {
    await saveRun(run);
    return toResponse(run, null, null);
  }

  const engine = engineIfReady();
  if (!engine) {
    await saveRun(run);
    return toResponse(run, 'model_unavailable', MODEL_UNAVAILABLE_NOTE);
  }

  try {
    const messages = [
      { role: 'system' as const, content: prompt.system },
      { role: 'user' as const, content: prompt.user },
    ];
    let answer = '';
    if (onToken) {
      const stream = await engine.chat.completions.create({
        messages,
        temperature: 0.1,
        max_tokens: 1024,
        stream: true,
      });
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content ?? '';
        if (delta) {
          answer += delta;
          onToken(delta, answer);
        }
      }
    } else {
      const completion = await engine.chat.completions.create({
        messages,
        temperature: 0.1,
        max_tokens: 1024,
      });
      answer = completion.choices[0]?.message?.content ?? '';
    }
    run.answer = answer;
    run.model_ref = currentModelRef();
    await saveRun(run);
    return toResponse(run, null, null);
  } catch (err) {
    await saveRun(run);
    return toResponse(
      run,
      'model_unavailable',
      `No model available — showing retrieved context. (${err instanceof Error ? err.message : err})`,
    );
  }
}
