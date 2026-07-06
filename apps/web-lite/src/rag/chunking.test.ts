import { describe, expect, it } from 'vitest';
import { chunkDocument, CHUNK_MAX_CHARS } from './chunking';

describe('chunkDocument', () => {
  it('splits on blank lines and preserves absolute offsets', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const chunks = chunkDocument('d1', text, null);
    expect(chunks).toHaveLength(1); // small paragraphs merge into one chunk
    expect(chunks[0].text).toBe('First paragraph.\n\nSecond paragraph.');
    expect(chunks[0].start_offset).toBe(0);
    expect(chunks[0].end_offset).toBe(text.length);
    expect(chunks[0].page).toBeNull();
    expect(chunks[0].parent_id).toBeNull();
  });

  it('never crosses PDF page boundaries and stamps page + parent', () => {
    const page1 = 'Alpha content on page one.';
    const page2 = 'Beta content on page two.';
    const text = `${page1}\n\n${page2}`;
    const pages = [
      { page: 1, start: 0, end: page1.length },
      { page: 2, start: page1.length + 2, end: text.length },
    ];
    const chunks = chunkDocument('d1', text, pages);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ page: 1, parent_id: 'd1:p1', text: page1 });
    expect(chunks[1]).toMatchObject({ page: 2, parent_id: 'd1:p2', text: page2 });
    expect(text.slice(chunks[1].start_offset, chunks[1].end_offset)).toBe(page2);
  });

  it('hard-splits oversized paragraphs at whitespace', () => {
    const words = Array.from({ length: 800 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkDocument('d1', words, null);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      // offsets must round-trip to the original text
      expect(words.slice(chunk.start_offset, chunk.end_offset).trim()).toBe(chunk.text);
    }
  });

  it('assigns sequential ordinals across pages', () => {
    const text = 'a\n\nb';
    const pages = [
      { page: 1, start: 0, end: 1 },
      { page: 2, start: 3, end: 4 },
    ];
    const chunks = chunkDocument('d1', text, pages);
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1]);
  });
});
