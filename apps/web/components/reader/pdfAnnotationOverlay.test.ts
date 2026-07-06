import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../lib/types';
import { quoteFallbackEligible } from './pdfAnnotationOverlay';

function ann(overrides: Partial<Annotation>): Annotation {
  return {
    id: 'a1',
    document_id: 'd1',
    type: 'highlight',
    quote: 'agent',
    start_offset: null,
    end_offset: null,
    page: null,
    color: null,
    body: null,
    labels: [],
    pdf_anchor: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('quoteFallbackEligible', () => {
  it('never quote-falls-back when the annotation carries rect geometry', () => {
    const rectAnchored = ann({
      page: 3,
      pdf_anchor: { rects: [{ page: 3, x: 0.1, y: 0.1, width: 0.2, height: 0.02 }] },
    });
    // Not on its own page (rect path handles that) and never on other pages.
    expect(quoteFallbackEligible(rectAnchored, 1)).toBe(false);
    expect(quoteFallbackEligible(rectAnchored, 3)).toBe(false);
  });

  it('quote-falls-back only on the recorded page when geometry is missing', () => {
    const noGeometry = ann({ page: 3, pdf_anchor: null });
    expect(quoteFallbackEligible(noGeometry, 3)).toBe(true);
    expect(quoteFallbackEligible(noGeometry, 1)).toBe(false);
  });

  it('legacy annotations without a page may match anywhere', () => {
    const legacy = ann({ page: null, pdf_anchor: null });
    expect(quoteFallbackEligible(legacy, 1)).toBe(true);
    expect(quoteFallbackEligible(legacy, 7)).toBe(true);
  });
});
