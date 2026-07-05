import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../lib/types';
import { annotationRanges, applyAnnotations, clearAnnotations, locate } from './annotationRendering';

function ann(partial: Partial<Annotation> & { id: string; quote: string }): Annotation {
  return {
    document_id: 'doc',
    type: 'highlight',
    start_offset: null,
    end_offset: null,
    page: null,
    color: null,
    body: null,
    labels: [],
    pdf_anchor: null,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('locate (offset -> exact -> normalized fallback)', () => {
  const content = 'The quick brown fox jumps.';

  it('trusts valid in-bounds offsets when the slice matches the quote', () => {
    expect(locate(content, 'quick', 4, 9)).toEqual([4, 9]);
  });

  it('falls back to exact substring when offsets are wrong', () => {
    expect(locate(content, 'brown', 0, 3)).toEqual([10, 15]);
  });

  it('falls back to whitespace-normalized lookup', () => {
    const spaced = 'The   quick\nbrown';
    // Quote has single spaces; content has irregular whitespace.
    const span = locate(spaced, 'quick brown', null, null);
    expect(span).not.toBeNull();
    expect(spaced.slice(span![0], span![1]).replace(/\s+/g, ' ')).toBe('quick brown');
  });

  it('returns null when the quote is absent', () => {
    expect(locate(content, 'zzz', null, null)).toBeNull();
  });
});

describe('annotationRanges', () => {
  it('merges overlapping annotations and accumulates ids', () => {
    const content = 'alpha beta gamma';
    const ranges = annotationRanges(content, [
      ann({ id: 'a', quote: 'alpha beta' }),
      ann({ id: 'b', quote: 'beta gamma' }),
    ]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].ids.sort()).toEqual(['a', 'b']);
  });

  it('skips annotations whose quote is not present', () => {
    expect(annotationRanges('hello world', [ann({ id: 'x', quote: 'absent' })])).toHaveLength(0);
  });
});

describe('applyAnnotations', () => {
  it('wraps a matching quote in a mark carrying its id', () => {
    const el = document.createElement('div');
    el.textContent = 'The quick brown fox';
    applyAnnotations(el, [ann({ id: 'h1', quote: 'quick brown' })]);
    const mark = el.querySelector('mark.annotation');
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute('data-annotation-ids')).toBe('h1');
    expect(mark!.textContent).toBe('quick brown');
  });

  it('is idempotent — re-applying does not nest marks', () => {
    const el = document.createElement('div');
    el.textContent = 'one two three';
    const a = [ann({ id: 'h', quote: 'two' })];
    applyAnnotations(el, a);
    applyAnnotations(el, a);
    expect(el.querySelectorAll('mark.annotation')).toHaveLength(1);
  });

  it('clearAnnotations restores plain text', () => {
    const el = document.createElement('div');
    el.textContent = 'keep me';
    applyAnnotations(el, [ann({ id: 'h', quote: 'keep' })]);
    clearAnnotations(el);
    expect(el.querySelector('mark')).toBeNull();
    expect(el.textContent).toBe('keep me');
  });
});
