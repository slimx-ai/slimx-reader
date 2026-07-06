// Line-for-line port of apps/api/app/services/rag/context_packing.py. Admits whole chunks under a
// token budget (never cut mid-sentence, citation never detached), caps per parent, skips
// near-identical siblings, and records every rejection with a reason.

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  const n = (text || '').length;
  return n === 0 ? 0 : Math.max(1, Math.ceil(n / CHARS_PER_TOKEN));
}

export type CandidateChunk = {
  chunk_id: string;
  text: string;
  citation?: string;
  document_id?: string | null;
  page?: number | null;
  section?: string | null;
  parent_id?: string | null;
  score?: number;
};

export type AdmittedChunk = { chunk: CandidateChunk; tokens: number };

export type RejectedChunk = {
  chunk_id: string;
  reason: 'empty' | 'duplicate_text' | 'parent_cap' | 'budget_exhausted';
  tokens: number;
  score: number;
  document_id: string | null;
  page: number | null;
};

export type PackResult = {
  admitted: AdmittedChunk[];
  rejected: RejectedChunk[];
  total_tokens: number;
  budget_tokens: number;
};

export function packChunks(
  candidates: CandidateChunk[],
  { budgetTokens, maxPerParent = 2 }: { budgetTokens: number; maxPerParent?: number },
): PackResult {
  const result: PackResult = {
    admitted: [],
    rejected: [],
    total_tokens: 0,
    budget_tokens: Math.max(0, budgetTokens),
  };
  const perParent = new Map<string, number>();
  const seen = new Set<string>();
  let used = 0;

  const rejected = (
    cand: CandidateChunk,
    reason: RejectedChunk['reason'],
    tokens: number,
  ): RejectedChunk => ({
    chunk_id: cand.chunk_id,
    reason,
    tokens,
    score: cand.score ?? 0,
    document_id: cand.document_id ?? null,
    page: cand.page ?? null,
  });

  for (const cand of candidates) {
    const tokens = estimateTokens(cand.text) + estimateTokens(cand.citation ?? '');
    const norm = (cand.text || '').split(/\s+/).join(' ').trim().toLowerCase();
    const parent = cand.parent_id || cand.chunk_id;
    if (!(cand.text || '').trim()) {
      result.rejected.push(rejected(cand, 'empty', 0));
      continue;
    }
    if (seen.has(norm)) {
      result.rejected.push(rejected(cand, 'duplicate_text', tokens));
      continue;
    }
    if ((perParent.get(parent) ?? 0) >= maxPerParent) {
      result.rejected.push(rejected(cand, 'parent_cap', tokens));
      continue;
    }
    if (used + tokens > result.budget_tokens) {
      result.rejected.push(rejected(cand, 'budget_exhausted', tokens));
      continue;
    }
    result.admitted.push({ chunk: cand, tokens });
    used += tokens;
    seen.add(norm);
    perParent.set(parent, (perParent.get(parent) ?? 0) + 1);
  }
  result.total_tokens = used;
  return result;
}
