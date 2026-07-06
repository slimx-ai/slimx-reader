// Makes mouse text-selection more forgiving before it becomes a highlight/comment.
//
//  1. Word snapping — a rough drag that ends mid-word expands to whole words, so you don't need
//     pixel-precise dragging and the resulting highlight looks clean. Applies to any surface.
//  2. Paragraph containment — a downward drag that spills only slightly into the next block is
//     trimmed back to the paragraph it started in. Applies only where DOM blocks exist (the
//     markdown/text reader), not the PDF text layer whose spans have no block structure.
//
// The functions mutate the passed Range in place and return whether anything changed, so the caller
// can reflect the smoothed range back into the live selection for visual feedback.

const WORD_CHAR = /[\p{L}\p{N}_]/u;

// Block-level elements the markdown/text reader emits; the boundary a selection should not casually
// cross on a slight over-drag.
const BLOCK_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,pre,blockquote,td,th,dd,dt,figcaption';

// A spill into the next block up to this many (whitespace-collapsed) characters is treated as an
// accidental over-drag and trimmed; anything larger is kept as an intentional multi-paragraph range.
const PARAGRAPH_SPILL_LIMIT = 12;

function isWordChar(ch: string | undefined): boolean {
  return ch != null && WORD_CHAR.test(ch);
}

// Move a start boundary back to the beginning of the word it lands inside (no-op at a whitespace edge).
function snapStartToWord(node: Node, offset: number): number {
  if (node.nodeType !== Node.TEXT_NODE) return offset;
  const text = node.textContent ?? '';
  let i = offset;
  while (i > 0 && isWordChar(text[i - 1])) i -= 1;
  return i;
}

// Move an end boundary forward to the end of the word it lands inside (no-op at a whitespace edge).
function snapEndToWord(node: Node, offset: number): number {
  if (node.nodeType !== Node.TEXT_NODE) return offset;
  const text = node.textContent ?? '';
  let i = offset;
  while (i < text.length && isWordChar(text[i])) i += 1;
  return i;
}

function blockAncestor(node: Node, root: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  while (el && el !== root && root.contains(el)) {
    if (el.matches(BLOCK_SELECTOR)) return el;
    el = el.parentElement;
  }
  return null;
}

function lastTextNodeWithin(el: HTMLElement): Text | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    if ((node.textContent ?? '').length > 0) last = node;
    node = walker.nextNode() as Text | null;
  }
  return last;
}

// If the range starts in one block and ends in a later block but only barely spills into it, pull the
// end back to the end of the start block. Returns true if the range was trimmed.
function clampToStartBlock(range: Range, root: HTMLElement): boolean {
  const startBlock = blockAncestor(range.startContainer, root);
  const endBlock = blockAncestor(range.endContainer, root);
  if (!startBlock || !endBlock || startBlock === endBlock) return false;

  const spill = range.cloneRange();
  try {
    spill.setStartAfter(startBlock);
  } catch {
    return false;
  }
  const spilledText = spill.toString().replace(/\s+/g, ' ').trim();
  if (spilledText.length >= PARAGRAPH_SPILL_LIMIT) return false;

  const last = lastTextNodeWithin(startBlock);
  if (!last) return false;
  range.setEnd(last, (last.textContent ?? '').length);
  return true;
}

/**
 * Smooth a raw selection Range in place: snap both edges to whole words, and (when `blockRoot` is a
 * DOM container with real blocks) keep a slight over-drag from spilling into the next block. Returns
 * whether the range was changed.
 */
export function smoothSelectionRange(range: Range, blockRoot: HTMLElement | null): boolean {
  let changed = false;

  const start = snapStartToWord(range.startContainer, range.startOffset);
  if (start !== range.startOffset) {
    range.setStart(range.startContainer, start);
    changed = true;
  }
  const end = snapEndToWord(range.endContainer, range.endOffset);
  if (end !== range.endOffset) {
    range.setEnd(range.endContainer, end);
    changed = true;
  }

  if (blockRoot && clampToStartBlock(range, blockRoot)) changed = true;

  return changed;
}
