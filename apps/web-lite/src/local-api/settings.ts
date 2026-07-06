// Browser-local settings: everything runs on-device, so the cloud/provider knobs are fixed and
// only the retrieval tuning (top-k / min-score) and model choice persist.
import type { ReaderSettings } from '@web/lib/types';
import { getDb } from '../db/db';
import { DEFAULT_LLM_MODEL, LLM_PROVIDER } from '../llm/engineManager';
import { MAX_UPLOAD_MB } from './documents';

const OVERRIDES_KEY = 'settings-overrides';

type Overrides = Partial<
  Pick<ReaderSettings, 'default_model' | 'rag_default_top_k' | 'rag_min_score'>
>;

const BASE: ReaderSettings = {
  enable_rag: true,
  slimx_rag_url: null,
  slimx_rag_auth_token_set: false,
  allow_cloud_providers: false,
  default_provider: LLM_PROVIDER,
  default_model: DEFAULT_LLM_MODEL,
  ollama_base_url: '',
  oai_base_url: null,
  rag_default_top_k: 8,
  rag_min_score: 0,
  max_document_upload_mb: MAX_UPLOAD_MB,
};

export async function getSettings(): Promise<ReaderSettings> {
  const db = await getDb();
  const overrides = ((await db.get('settings', OVERRIDES_KEY)) as Overrides | undefined) ?? {};
  return { ...BASE, ...overrides };
}

export async function updateSettings(
  payload: Partial<
    Pick<
      ReaderSettings,
      | 'default_provider'
      | 'default_model'
      | 'allow_cloud_providers'
      | 'rag_default_top_k'
      | 'rag_min_score'
    >
  >,
): Promise<ReaderSettings> {
  const db = await getDb();
  const overrides = ((await db.get('settings', OVERRIDES_KEY)) as Overrides | undefined) ?? {};
  const next: Overrides = { ...overrides };
  if (payload.default_model !== undefined) next.default_model = payload.default_model;
  if (payload.rag_default_top_k !== undefined) next.rag_default_top_k = payload.rag_default_top_k;
  if (payload.rag_min_score !== undefined) next.rag_min_score = payload.rag_min_score;
  await db.put('settings', next, OVERRIDES_KEY);
  return getSettings();
}
