// PDF word-geometry helpers (inspired by Lexio's word cache) — the geometry source for durable
// annotation anchors. Ported from SlimX-AI ControlRoom's pdfWordCache.ts (MIT). Native DOM Selection
// over the pdf.js text layer stays the selection surface; this module only turns a selection into
// stable, zoom-independent NORMALIZED rectangles (0..1 of each page box) persisted in pdf_anchor.rects.
// The math is isolated in pure helpers so it is unit-testable under jsdom (which has no layout).

export type RectLike = { left: number; top: number; width: number; height: number };
export type PageBox = { left: number; top: number; width: number; height: number };

export type NormalizedRect = {
  page: number;
  x: number; // 0..1 of page width
  y: number; // 0..1 of page height
  width: number; // 0..1
  height: number; // 0..1
};

/** Normalize a viewport-pixel rect to 0..1 of a page box. Pure; clamps to [0,1]. */
export function normalizeRect(rect: RectLike, page: PageBox, pageNumber: number): NormalizedRect {
  const w = page.width || 1;
  const h = page.height || 1;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return {
    page: pageNumber,
    x: clamp01((rect.left - page.left) / w),
    y: clamp01((rect.top - page.top) / h),
    width: clamp01(rect.width / w),
    height: clamp01(rect.height / h),
  };
}

/** Denormalize a stored rect back to pixels relative to a page box (its origin). Pure. */
export function denormalizeRect(rect: NormalizedRect, page: PageBox): RectLike {
  return {
    left: rect.x * page.width,
    top: rect.y * page.height,
    width: rect.width * page.width,
    height: rect.height * page.height,
  };
}

/** Nearest `.pdf-viewer-page-canvas[data-page]` ancestor/self of a node, or null. */
function pageCanvasOf(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  return (el?.closest('.pdf-viewer-page-canvas[data-page]') as HTMLElement | null) ?? null;
}

// Vertical overlap ratio of two rects, relative to the smaller height (1 = same line, 0 = disjoint).
function verticalOverlapRatio(a: RectLike, b: RectLike): number {
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  const minHeight = Math.min(a.height, b.height) || 1;
  return overlap / minHeight;
}

/**
 * Collapse a selection's raw client rectangles into ONE clean band per text line.
 *
 * pdf.js Range.getClientRects() emits several overlapping rectangles per line that bleed into the
 * neighbouring line. Painted with `mix-blend-mode: multiply`, every overlap darkens. We union
 * same-line rects into a single band, then trim vertical overlap between adjacent bands to a shared
 * midpoint so no pixel is painted twice. Pure + coordinate-agnostic, so it is unit-testable.
 */
export function mergeRectsIntoLines(rects: RectLike[]): RectLike[] {
  const clean = rects.filter((r) => r.width > 0.5 && r.height > 0.5);
  if (clean.length <= 1) return clean.map((r) => ({ ...r }));
  const sorted = [...clean].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: RectLike[] = [];
  for (const r of sorted) {
    const band = lines[lines.length - 1];
    if (band && verticalOverlapRatio(band, r) > 0.5) {
      const left = Math.min(band.left, r.left);
      const top = Math.min(band.top, r.top);
      const right = Math.max(band.left + band.width, r.left + r.width);
      const bottom = Math.max(band.top + band.height, r.top + r.height);
      band.left = left;
      band.top = top;
      band.width = right - left;
      band.height = bottom - top;
    } else {
      lines.push({ ...r });
    }
  }
  for (let i = 0; i < lines.length - 1; i += 1) {
    const cur = lines[i];
    const next = lines[i + 1];
    const curBottom = cur.top + cur.height;
    if (curBottom > next.top) {
      const mid = (curBottom + next.top) / 2;
      cur.height = Math.max(0, mid - cur.top);
      const shift = mid - next.top;
      next.top = mid;
      next.height = Math.max(0, next.height - shift);
    }
  }
  return lines;
}

/**
 * Build normalized per-page rectangles for a selection Range, attributing each client rect to the
 * page canvas that visually contains it. Returns [] when the selection has no measurable geometry
 * (e.g. jsdom, or a collapsed range) so the caller keeps the quote/offset-only anchor. Rects are
 * attributed to the range's start page (single-page selections only).
 */
export function collectSelectionRects(range: Range): NormalizedRect[] {
  const startPage = pageCanvasOf(range.startContainer);
  if (!startPage) return [];
  const pageNumber = Number(startPage.dataset.page) || 0;
  if (!pageNumber) return [];
  const pageBox = startPage.getBoundingClientRect();
  if (!pageBox.width || !pageBox.height) return [];

  const onPage = Array.from(range.getClientRects())
    .map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height }))
    .filter((r) => {
      const centerX = r.left + r.width / 2;
      const centerY = r.top + r.height / 2;
      return (
        centerX >= pageBox.left &&
        centerX <= pageBox.right &&
        centerY >= pageBox.top &&
        centerY <= pageBox.bottom
      );
    });
  return mergeRectsIntoLines(onPage).map((r) => normalizeRect(r, pageBox, pageNumber));
}
