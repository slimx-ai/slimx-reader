import type { AnnotationCreate, PdfAnchorRect } from './types';
import { collectSelectionRects } from '../components/reader/pdfWordCache';
import { smoothSelectionRange } from './selectionSmoothing';

// Convert a DOM Range into [start, end] offsets of a container's rendered textContent, by walking
// its text nodes. Returns null if the range endpoints can't be located in the container.
export function textOffsetsWithin(container: HTMLElement, range: Range): [number, number] | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let start: number | null = null;
  let end: number | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (node === range.startContainer) start = offset + range.startOffset;
    if (node === range.endContainer) end = offset + range.endOffset;
    offset += length;
    node = walker.nextNode() as Text | null;
  }
  if (start == null || end == null || end <= start) return null;
  return [start, end];
}

export type SelectionInfo = {
  quote: string;
  rect: DOMRect;
  /** A partially-filled annotation payload; the caller sets `type`/`body`. */
  anchor: Pick<AnnotationCreate, 'start_offset' | 'end_offset' | 'page' | 'pdf_anchor'>;
};

/**
 * Inspect the current window selection and, if it lies inside an annotatable surface (a pdf.js text
 * layer or a container marked `data-annotate="markdown"`), return the quote, a positioning rect, and
 * a durable anchor. Returns null otherwise (collapsed selection, or outside any reader surface).
 *
 * When `smooth` is set (mouse selections), the raw drag is snapped to whole words and kept from
 * spilling into the next block, and the smoothed range is reflected back into the live selection so
 * the user sees the adjustment. Keyboard (shift+arrow) selections pass `smooth: false` so per-character
 * intent is preserved.
 */
export function readSelection({ smooth = false }: { smooth?: boolean } = {}): SelectionInfo | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  // Clone so the range we read `quote`/rects from is independent of the live selection — reflecting a
  // smoothed range back below calls `removeAllRanges()`, which would otherwise collapse a live range.
  const range = selection.getRangeAt(0).cloneRange();

  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement;

  const pdfLayer = startEl?.closest('.pdf-viewer-text-layer');
  const mdContainer = startEl?.closest<HTMLElement>('[data-annotate="markdown"]');

  if (smooth && (pdfLayer || mdContainer)) {
    if (smoothSelectionRange(range, mdContainer ?? null)) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  const quote = range.toString().trim();
  if (!quote) return null;
  const rect = range.getBoundingClientRect();

  if (pdfLayer) {
    const pageCanvas = startEl?.closest<HTMLElement>('.pdf-viewer-page-canvas[data-page]');
    const page = pageCanvas ? Number(pageCanvas.dataset.page) || null : null;
    const rects = collectSelectionRects(range) as PdfAnchorRect[];
    return {
      quote,
      rect,
      anchor: {
        page,
        pdf_anchor: rects.length ? { rects } : null,
        start_offset: null,
        end_offset: null,
      },
    };
  }

  if (mdContainer) {
    const offsets = textOffsetsWithin(mdContainer, range);
    return {
      quote,
      rect,
      anchor: {
        start_offset: offsets?.[0] ?? null,
        end_offset: offsets?.[1] ?? null,
        page: null,
        pdf_anchor: null,
      },
    };
  }

  return null;
}
