// Page-aware paragraph chunking. Splits on blank lines, greedily merges neighbors up to a target
// size, hard-splits oversized paragraphs at whitespace, and never crosses a PDF page boundary —
// so every chunk carries an honest page number for its citation label.
import type { PageSpan } from '../db/db';
import { estimateTokens } from './contextPacking';

export const CHUNK_TARGET_CHARS = 1100;
export const CHUNK_MAX_CHARS = 1600;

export type ChunkDraft = {
  ordinal: number;
  text: string;
  page: number | null;
  start_offset: number;
  end_offset: number;
  parent_id: string | null;
  token_count: number;
};

type Segment = { text: string; start: number; end: number };

/** Paragraph segments (blank-line separated) of text[rangeStart..rangeEnd), absolute offsets. */
function paragraphSegments(text: string, rangeStart: number, rangeEnd: number): Segment[] {
  const slice = text.slice(rangeStart, rangeEnd);
  const segments: Segment[] = [];
  const separator = /\n[ \t]*\n+/g;
  let cursor = 0;
  const push = (from: number, to: number) => {
    const raw = slice.slice(from, to);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) {
      segments.push({
        text: trimmed,
        start: rangeStart + from + leading,
        end: rangeStart + from + leading + trimmed.length,
      });
    }
  };
  for (let m = separator.exec(slice); m; m = separator.exec(slice)) {
    push(cursor, m.index);
    cursor = m.index + m[0].length;
  }
  push(cursor, slice.length);
  return segments;
}

/** Split an oversized segment at whitespace near CHUNK_TARGET_CHARS boundaries. */
function splitLongSegment(segment: Segment): Segment[] {
  if (segment.text.length <= CHUNK_MAX_CHARS) return [segment];
  const parts: Segment[] = [];
  let offset = 0;
  while (offset < segment.text.length) {
    let cut = Math.min(offset + CHUNK_TARGET_CHARS, segment.text.length);
    if (cut < segment.text.length) {
      const window = segment.text.slice(offset, cut);
      const lastSpace = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
      if (lastSpace > CHUNK_TARGET_CHARS / 2) cut = offset + lastSpace;
    }
    const piece = segment.text.slice(offset, cut).trim();
    if (piece) {
      parts.push({ text: piece, start: segment.start + offset, end: segment.start + cut });
    }
    offset = cut;
    while (offset < segment.text.length && /\s/.test(segment.text[offset])) offset += 1;
  }
  return parts;
}

export function chunkDocument(
  documentId: string,
  text: string,
  pages: PageSpan[] | null,
): ChunkDraft[] {
  const ranges: Array<{ page: number | null; start: number; end: number }> = pages?.length
    ? pages.map((p) => ({ page: p.page, start: p.start, end: p.end }))
    : [{ page: null, start: 0, end: text.length }];

  const drafts: ChunkDraft[] = [];
  for (const range of ranges) {
    const segments = paragraphSegments(text, range.start, range.end).flatMap(splitLongSegment);
    let current: Segment | null = null;
    const flush = () => {
      if (!current) return;
      drafts.push({
        ordinal: drafts.length,
        text: current.text,
        page: range.page,
        start_offset: current.start,
        end_offset: current.end,
        parent_id: range.page !== null ? `${documentId}:p${range.page}` : null,
        token_count: estimateTokens(current.text),
      });
      current = null;
    };
    for (const segment of segments) {
      if (!current) {
        current = { ...segment };
      } else if (current.text.length + segment.text.length + 2 <= CHUNK_TARGET_CHARS) {
        current = {
          text: `${current.text}\n\n${segment.text}`,
          start: current.start,
          end: segment.end,
        };
      } else {
        flush();
        current = { ...segment };
      }
    }
    flush();
  }
  return drafts;
}
