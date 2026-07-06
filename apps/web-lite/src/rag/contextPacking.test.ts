// Mirrors the behaviors of apps/api/app/services/rag/context_packing.py so the TS port stays true.
import { describe, expect, it } from 'vitest';
import { estimateTokens, packChunks, type CandidateChunk } from './contextPacking';

const chunk = (id: string, text: string, extra: Partial<CandidateChunk> = {}): CandidateChunk => ({
  chunk_id: id,
  text,
  ...extra,
});

describe('estimateTokens', () => {
  it('is ceil(chars/4) with a floor of 1 for non-empty text', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('packChunks', () => {
  it('admits whole chunks in order until the budget is exhausted', () => {
    const result = packChunks(
      [chunk('a', 'x'.repeat(400)), chunk('b', 'y'.repeat(400)), chunk('c', 'z'.repeat(400))],
      { budgetTokens: 200 },
    );
    expect(result.admitted.map((a) => a.chunk.chunk_id)).toEqual(['a', 'b']);
    expect(result.rejected).toEqual([
      expect.objectContaining({ chunk_id: 'c', reason: 'budget_exhausted', tokens: 100 }),
    ]);
    expect(result.total_tokens).toBe(200);
  });

  it('caps chunks per parent at 2 and never truncates', () => {
    const result = packChunks(
      [
        chunk('a', 'first text', { parent_id: 'p1' }),
        chunk('b', 'second text', { parent_id: 'p1' }),
        chunk('c', 'third text', { parent_id: 'p1' }),
        chunk('d', 'other parent', { parent_id: 'p2' }),
      ],
      { budgetTokens: 1000 },
    );
    expect(result.admitted.map((a) => a.chunk.chunk_id)).toEqual(['a', 'b', 'd']);
    expect(result.rejected[0]).toMatchObject({ chunk_id: 'c', reason: 'parent_cap' });
  });

  it('skips empty and whitespace-normalized duplicate text', () => {
    const result = packChunks(
      [
        chunk('a', 'Same   Words here'),
        chunk('b', '  same words\nhere '),
        chunk('c', '   '),
      ],
      { budgetTokens: 1000 },
    );
    expect(result.admitted.map((a) => a.chunk.chunk_id)).toEqual(['a']);
    expect(result.rejected).toEqual([
      expect.objectContaining({ chunk_id: 'b', reason: 'duplicate_text' }),
      expect.objectContaining({ chunk_id: 'c', reason: 'empty', tokens: 0 }),
    ]);
  });

  it('counts the citation against the budget', () => {
    const result = packChunks([chunk('a', 'abcd', { citation: 'efgh' })], { budgetTokens: 1 });
    expect(result.admitted).toHaveLength(0);
    expect(result.rejected[0]).toMatchObject({ reason: 'budget_exhausted', tokens: 2 });
  });
});
