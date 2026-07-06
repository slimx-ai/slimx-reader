import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_COLORS, highlightColor } from './highlightColors';

describe('highlightColor', () => {
  it('resolves a known key', () => {
    expect(highlightColor('green').key).toBe('green');
    expect(highlightColor('blue').key).toBe('blue');
  });

  it('falls back to the default (yellow) for null/unknown keys', () => {
    expect(highlightColor(null).key).toBe('yellow');
    expect(highlightColor(undefined).key).toBe('yellow');
    expect(highlightColor('chartreuse').key).toBe('yellow');
  });

  it('exposes exactly the five palette colors', () => {
    expect(HIGHLIGHT_COLORS.map((c) => c.key)).toEqual(['yellow', 'green', 'blue', 'pink', 'orange']);
    for (const c of HIGHLIGHT_COLORS) {
      expect(c.mark).toMatch(/^rgba\(/);
      expect(c.pdf).toMatch(/^rgba\(/);
    }
  });
});
