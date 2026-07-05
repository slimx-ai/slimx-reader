import { describe, expect, it } from 'vitest';
import { denormalizeRect, mergeRectsIntoLines, normalizeRect } from './pdfWordCache';

describe('normalizeRect / denormalizeRect', () => {
  const page = { left: 100, top: 50, width: 400, height: 800 };

  it('normalizes a viewport rect to 0..1 of the page box', () => {
    const nr = normalizeRect({ left: 200, top: 130, width: 40, height: 16 }, page, 3);
    expect(nr.page).toBe(3);
    expect(nr.x).toBeCloseTo(0.25); // (200-100)/400
    expect(nr.y).toBeCloseTo(0.1); // (130-50)/800
    expect(nr.width).toBeCloseTo(0.1);
    expect(nr.height).toBeCloseTo(0.02);
  });

  it('round-trips back to page-origin pixels', () => {
    const nr = normalizeRect({ left: 200, top: 130, width: 40, height: 16 }, page, 1);
    const px = denormalizeRect(nr, page);
    expect(px.left).toBeCloseTo(100); // page-origin (200 - page.left)
    expect(px.top).toBeCloseTo(80);
    expect(px.width).toBeCloseTo(40);
    expect(px.height).toBeCloseTo(16);
  });

  it('clamps out-of-page rects to [0,1]', () => {
    const nr = normalizeRect({ left: -50, top: 2000, width: 9999, height: 10 }, page, 1);
    expect(nr.x).toBe(0);
    expect(nr.y).toBe(1);
    expect(nr.width).toBe(1);
  });
});

describe('mergeRectsIntoLines', () => {
  it('unions overlapping same-line rects into one band', () => {
    const merged = mergeRectsIntoLines([
      { left: 10, top: 20, width: 30, height: 12 },
      { left: 35, top: 21, width: 30, height: 12 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].left).toBe(10);
    expect(merged[0].width).toBe(55); // 65 - 10
  });

  it('keeps distinct lines separate and trims their overlap', () => {
    const merged = mergeRectsIntoLines([
      { left: 10, top: 20, width: 40, height: 14 },
      { left: 10, top: 30, width: 40, height: 14 },
    ]);
    expect(merged).toHaveLength(2);
    // No vertical overlap remains between the two bands.
    const [a, b] = merged;
    expect(a.top + a.height).toBeLessThanOrEqual(b.top + 0.001);
  });

  it('drops sub-pixel noise rects', () => {
    expect(mergeRectsIntoLines([{ left: 0, top: 0, width: 0.2, height: 0.2 }])).toHaveLength(0);
  });
});
