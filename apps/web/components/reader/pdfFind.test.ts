import { describe, expect, it } from 'vitest';
import { countMatches, findMatchRanges, normalizeForFind } from './pdfFind';

describe('countMatches', () => {
  it('counts case-insensitive, whitespace-normalized occurrences', () => {
    expect(countMatches('The cat sat on the mat', normalizeForFind('the'))).toBe(2);
    expect(countMatches('THE the ThE', normalizeForFind('the'))).toBe(3);
  });

  it('matches across collapsed whitespace / line breaks', () => {
    expect(countMatches('a control-room\n   interface here', normalizeForFind('room interface'))).toBe(1);
  });

  it('returns 0 for an empty query or no match', () => {
    expect(countMatches('anything', '')).toBe(0);
    expect(countMatches('anything', normalizeForFind('absent'))).toBe(0);
  });
});

describe('findMatchRanges', () => {
  it('finds every occurrence as a DOM range', () => {
    const el = document.createElement('div');
    el.textContent = 'foo bar foo baz foo';
    const ranges = findMatchRanges(el, normalizeForFind('foo'));
    expect(ranges).toHaveLength(3);
    expect(ranges.every((r) => r.toString() === 'foo')).toBe(true);
  });

  it('spans a match across adjacent elements', () => {
    const el = document.createElement('div');
    el.innerHTML = '<span>hel</span><span>lo world</span>';
    const ranges = findMatchRanges(el, normalizeForFind('hello'));
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe('hello');
  });

  it('returns nothing for an empty query', () => {
    const el = document.createElement('div');
    el.textContent = 'text';
    expect(findMatchRanges(el, '')).toHaveLength(0);
  });
});
