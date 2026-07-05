import type { ReaderSettings } from '../types';
import { apiFetch } from './http';

export async function getSettings(): Promise<ReaderSettings> {
  return apiFetch<ReaderSettings>('/api/settings');
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
  return apiFetch<ReaderSettings>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
