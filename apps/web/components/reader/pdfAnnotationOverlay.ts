import type { Annotation } from '../../lib/types';
import { highlightColor } from '../../lib/highlightColors';
import { annotationRanges } from './annotationRendering';
import {
  denormalizeRect,
  mergeRectsIntoLines,
  type NormalizedRect,
  type RectLike,
} from './pdfWordCache';

// Paint PDF annotations WITHOUT touching the pdf.js text layer. Adapted from SlimX-AI ControlRoom's
// pdfAnnotationOverlay.ts (MIT). The text layer IS the browser's selection surface; wrapping its spans
// in <mark> makes selection fragile, so we draw rectangles into a separate, non-interactive overlay.
// Two geometry sources:
//   1. Rect-first (durable): the annotation carries pdf_anchor.rects (normalized page-space rects
//      captured at selection time). Denormalize against the current page canvas — precise,
//      zoom-independent, cheap. Preferred.
//   2. Quote/offset fallback: locate the saved quote in the page's text, build a DOM Range, and paint
//      one <div> per client rect. Used for any annotation without rects on this page.

function rangeFromVisibleOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Text | null = null;
  let startPos = 0;
  let endNode: Text | null = null;
  let endPos = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (!startNode && start < offset + length) {
      startNode = node;
      startPos = start - offset;
    }
    if (startNode && end <= offset + length) {
      endNode = node;
      endPos = end - offset;
      break;
    }
    offset += length;
    node = walker.nextNode() as Text | null;
  }
  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, startPos);
    range.setEnd(endNode, endPos);
    return range;
  } catch {
    return null;
  }
}

type BoxSpec = { modifier: string; title: string; ids: string[]; fill?: string | null };

// Build one overlay rectangle in page-canvas-origin pixels (0,0 = canvas top-left) so a box scrolls
// and zooms with the page and never needs re-measuring on scroll.
function makeBox(rect: RectLike, spec: BoxSpec): HTMLDivElement {
  const box = document.createElement('div');
  box.className = `pdf-annotation ${spec.modifier}`;
  // Never intercept pointer events — a drag over a highlight must reach the text layer, not the box.
  box.style.pointerEvents = 'none';
  if (spec.fill) box.style.background = spec.fill;
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  box.setAttribute('title', spec.title);
  if (spec.ids.length) box.setAttribute('data-annotation-ids', Array.from(new Set(spec.ids)).join(' '));
  return box;
}

function typeModifier(type: string): string {
  if (type === 'comment') return 'pdf-annotation-comment';
  if (type === 'ask_anchor') return 'pdf-annotation-ask';
  return 'pdf-annotation-highlight';
}

function pageRects(anchor: Annotation['pdf_anchor'], pageNumber: number): NormalizedRect[] | null {
  if (!anchor?.rects?.length || !pageNumber) return null;
  const onPage = anchor.rects.filter((r) => r.page === pageNumber);
  return onPage.length ? onPage : null;
}

/**
 * Whether an annotation may be located on `pageNumber` by quote search. Only when it carries NO
 * stored geometry at all (rect-anchored annotations know exactly where they live), and only on its
 * own recorded page — otherwise a short quote like "agent" matches text on every page and paints
 * spurious boxes far from the real anchor (which also mis-anchors the gutter pins/cards).
 * Legacy annotations without a recorded page may match anywhere.
 */
export function quoteFallbackEligible(ann: Annotation, pageNumber: number): boolean {
  if (ann.pdf_anchor?.rects?.length) return false;
  return ann.page == null || ann.page === pageNumber;
}

/**
 * Paint saved annotations for ONE PDF page into its overlay layer. Rect-anchored annotations paint
 * directly from stored geometry; everything else falls back to locating the quote against the page's
 * text layer. Idempotent: clears the overlay first so a zoom re-render never duplicates rects.
 */
export function renderPdfPageOverlay(
  pageCanvas: HTMLElement,
  textLayer: HTMLElement,
  overlay: HTMLElement,
  annotations: Annotation[],
): void {
  overlay.replaceChildren();
  const pageNumber = Number(pageCanvas.dataset.page) || 0;
  const pageBox = pageCanvas.getBoundingClientRect();

  const paintLines = (rects: RectLike[], spec: BoxSpec) => {
    for (const rect of mergeRectsIntoLines(rects)) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      overlay.appendChild(makeBox(rect, spec));
    }
  };

  const fallback: Annotation[] = [];
  for (const ann of annotations) {
    const rects = pageRects(ann.pdf_anchor, pageNumber);
    if (rects) {
      paintLines(
        rects.map((nr) => denormalizeRect(nr, pageBox)),
        {
          modifier: typeModifier(ann.type),
          title: ann.body || (ann.labels?.length ? `Labels: ${ann.labels.join(', ')}` : 'Saved highlight'),
          ids: [ann.id],
          fill: ann.type === 'highlight' ? highlightColor(ann.color).pdf : null,
        },
      );
    } else if (quoteFallbackEligible(ann, pageNumber)) {
      fallback.push(ann);
    }
  }

  // Quote/offset fallback for annotations without page rects.
  const content = textLayer.textContent ?? '';
  if (!content) return;
  for (const range of annotationRanges(content, fallback)) {
    const domRange = rangeFromVisibleOffsets(textLayer, range.start, range.end);
    if (!domRange) continue;
    const rectLikes = Array.from(domRange.getClientRects()).map((r) => ({
      left: r.left - pageBox.left,
      top: r.top - pageBox.top,
      width: r.width,
      height: r.height,
    }));
    const hi = range.types.indexOf('highlight');
    paintLines(rectLikes, {
      modifier: typeModifier(range.types[0] || 'highlight'),
      title: range.bodies[0] || 'Saved highlight',
      ids: range.ids,
      fill: hi === -1 ? null : highlightColor(range.colors[hi]).pdf,
    });
  }
}
