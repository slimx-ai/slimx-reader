// Text-search helpers for the PDF viewer. Matching is case-insensitive and whitespace-normalized
// (runs of whitespace collapse to a single space) so a query still matches text that pdf.js split
// across items or wrapped across lines. `countMatches` runs on a page's extracted text (cheap, works
// for unrendered pages); `findMatchRanges` locates the same matches as DOM Ranges in a rendered text
// layer so they can be highlighted and scrolled to.

export function normalizeForFind(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Whitespace-collapsed, lowercased projection of `text`, plus a map from each normalized index back
// to the corresponding original index.
function project(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let prevSpace = true; // treat leading whitespace as already-trimmed
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      norm += ' ';
      map.push(i);
      prevSpace = true;
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      prevSpace = false;
    }
  }
  while (norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export function countMatches(text: string, qNorm: string): number {
  if (!qNorm) return 0;
  const { norm } = project(text);
  let count = 0;
  let from = 0;
  for (;;) {
    const i = norm.indexOf(qNorm, from);
    if (i < 0) break;
    count += 1;
    from = i + qNorm.length;
  }
  return count;
}

function rangeFromOriginalOffsets(
  nodes: Array<{ node: Text; start: number }>,
  start: number,
  end: number,
): Range | null {
  let startNode: Text | null = null;
  let startPos = 0;
  let endNode: Text | null = null;
  let endPos = 0;
  for (const { node, start: s } of nodes) {
    const len = node.textContent?.length ?? 0;
    if (!startNode && start < s + len) {
      startNode = node;
      startPos = start - s;
    }
    if (startNode && end <= s + len) {
      endNode = node;
      endPos = end - s;
      break;
    }
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

// All DOM Ranges in `container` (a rendered text layer) matching the normalized query, in reading order.
export function findMatchRanges(container: HTMLElement, qNorm: string): Range[] {
  if (!qNorm) return [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number }> = [];
  let full = '';
  let node = walker.nextNode() as Text | null;
  while (node) {
    nodes.push({ node, start: full.length });
    full += node.textContent ?? '';
    node = walker.nextNode() as Text | null;
  }
  const { norm, map } = project(full);
  const ranges: Range[] = [];
  let from = 0;
  for (;;) {
    const i = norm.indexOf(qNorm, from);
    if (i < 0) break;
    const origStart = map[i];
    const origEnd = map[i + qNorm.length - 1] + 1;
    if (origStart != null && origEnd != null) {
      const range = rangeFromOriginalOffsets(nodes, origStart, origEnd);
      if (range) ranges.push(range);
    }
    from = i + qNorm.length;
  }
  return ranges;
}
