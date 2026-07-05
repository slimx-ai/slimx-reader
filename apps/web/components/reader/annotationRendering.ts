import type { Annotation } from '../../lib/types';

// Shared annotation renderer: locates saved annotations against the rendered (visible) text of ANY
// DOM container and wraps matching spans in <mark>. Used by MarkdownReader (md/txt/code) and by the
// PDF overlay's quote fallback. Adapted from SlimX-AI ControlRoom's annotationRendering.ts (MIT),
// collapsed onto the reader's single Annotation shape.
//
// Marks carry class `annotation` + a per-type modifier, `data-annotation-ids`, `data-annotation-type`,
// and a `title`. A single span can carry several annotations at once (ids accumulate).

export type AnnotationRange = {
  start: number;
  end: number;
  ids: string[];
  types: string[];
  bodies: string[];
  labels: string[];
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, '');
}

function compatibleText(actual: string, quote: string): boolean {
  if (actual === quote) return true;
  if (collapseWhitespace(actual) === collapseWhitespace(quote)) return true;
  return compactWhitespace(actual) === compactWhitespace(quote);
}

function locateNormalized(content: string, quote: string): [number, number] | null {
  const normalizedQuote = compactWhitespace(quote);
  if (!normalizedQuote) return null;

  let normalizedContent = '';
  const originalIndices: number[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (/\s/.test(char)) continue;
    normalizedContent += char;
    originalIndices.push(index);
  }

  const normalizedStart = normalizedContent.indexOf(normalizedQuote);
  if (normalizedStart < 0) return null;
  const normalizedEnd = normalizedStart + normalizedQuote.length - 1;
  const start = originalIndices[normalizedStart];
  const end = originalIndices[normalizedEnd] + 1;
  if (start == null || end == null || end <= start) return null;
  return [start, end];
}

// Locate a quote against the rendered (visible) text of a container. Trust in-bounds offsets first
// when their slice is compatible with the saved quote after whitespace normalization, then fall back
// to exact and finally normalized quote lookup — so annotations survive minor whitespace differences.
export function locate(
  content: string,
  quote: string,
  startOffset?: number | null,
  endOffset?: number | null,
): [number, number] | null {
  const start = startOffset ?? -1;
  const end = endOffset ?? -1;
  if (start >= 0 && end > start && end <= content.length) {
    const actual = content.slice(start, end);
    if (!quote || compatibleText(actual, quote)) return [start, end];
  }
  if (quote) {
    const exactStart = content.indexOf(quote);
    if (exactStart >= 0) return [exactStart, exactStart + quote.length];
  }
  return locateNormalized(content, quote);
}

function typeModifier(type: string): string {
  if (type === 'comment') return 'annotation-comment';
  if (type === 'ask_anchor') return 'annotation-ask';
  return 'annotation-highlight';
}

// Resolve annotations into merged ranges. Overlapping ranges merge and accumulate ids so a rendered
// <mark> reflects every annotation on it.
export function annotationRanges(content: string, annotations: Annotation[]): AnnotationRange[] {
  const raw: AnnotationRange[] = [];
  for (const ann of annotations) {
    if (!ann.quote) continue;
    const span = locate(content, ann.quote, ann.start_offset, ann.end_offset);
    if (!span) continue;
    raw.push({
      start: span[0],
      end: span[1],
      ids: [ann.id],
      types: [ann.type],
      bodies: ann.body ? [ann.body] : [],
      labels: ann.labels ?? [],
    });
  }
  raw.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: AnnotationRange[] = [];
  for (const range of raw) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      previous.ids.push(...range.ids);
      previous.types.push(...range.types);
      previous.bodies.push(...range.bodies);
      previous.labels.push(...range.labels);
    } else {
      merged.push({
        ...range,
        ids: [...range.ids],
        types: [...range.types],
        bodies: [...range.bodies],
        labels: [...range.labels],
      });
    }
  }
  return merged;
}

function markTitle(range: AnnotationRange): string {
  const labels = Array.from(new Set(range.labels));
  return (
    [...range.bodies, labels.length ? `Labels: ${labels.join(', ')}` : null]
      .filter(Boolean)
      .join('\n') || 'Saved highlight'
  );
}

function markClasses(types: string[]): string {
  const set = new Set(types.map(typeModifier));
  return ['annotation', ...set].join(' ');
}

// Unwrap any marks a previous pass added, restoring the original text nodes. Needed because a second
// apply (e.g. after an annotation change) must start from clean text rather than nesting marks.
export function clearAnnotations(container: HTMLElement): void {
  const marks = container.querySelectorAll('mark.annotation');
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    (parent as Element).normalize?.();
  });
}

// Wrap annotation ranges in <mark> across the container's rendered text. Each original text node is
// rebuilt independently, so a range can span multiple elements.
export function applyAnnotations(container: HTMLElement, annotations: Annotation[]): void {
  clearAnnotations(container);
  const ranges = annotationRanges(container.textContent || '', annotations);
  if (!ranges.length) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;
  let current = walker.nextNode() as Text | null;
  while (current) {
    const length = current.textContent?.length || 0;
    nodes.push({ node: current, start: offset, end: offset + length });
    offset += length;
    current = walker.nextNode() as Text | null;
  }

  for (const entry of nodes) {
    const segments = ranges
      .map((range) => ({
        from: Math.max(range.start, entry.start) - entry.start,
        to: Math.min(range.end, entry.end) - entry.start,
        range,
      }))
      .filter((segment) => segment.to > segment.from)
      .sort((a, b) => a.from - b.from);
    if (!segments.length) continue;

    const text = entry.node.textContent || '';
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const segment of segments) {
      if (segment.from > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, segment.from)));
      }
      const sliceText = text.slice(segment.from, segment.to);
      // Keep whitespace-only slices (block boundaries) as plain text so we don't render stray boxes.
      if (!sliceText.trim()) {
        fragment.appendChild(document.createTextNode(sliceText));
        cursor = segment.to;
        continue;
      }
      const ids = Array.from(new Set(segment.range.ids));
      const mark = document.createElement('mark');
      mark.className = markClasses(segment.range.types);
      mark.setAttribute('title', markTitle(segment.range));
      mark.setAttribute('data-annotation-ids', ids.join(' '));
      mark.setAttribute('data-annotation-type', segment.range.types[0] || 'highlight');
      mark.textContent = sliceText;
      fragment.appendChild(mark);
      cursor = segment.to;
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    entry.node.parentNode?.replaceChild(fragment, entry.node);
  }
}
