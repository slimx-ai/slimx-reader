import { describe, expect, it } from 'vitest';
import { textOffsetsWithin } from './selection';

describe('textOffsetsWithin', () => {
  it('converts a DOM range to container-relative offsets across elements', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>Hello</p><p>world</p>';
    // textContent = "Helloworld"
    const first = container.querySelector('p:first-child')!.firstChild as Text;
    const second = container.querySelector('p:last-child')!.firstChild as Text;
    const range = document.createRange();
    range.setStart(first, 3); // "Hel|lo"
    range.setEnd(second, 3); // "wor|ld"
    expect(textOffsetsWithin(container, range)).toEqual([3, 8]);
  });

  it('returns null for a collapsed range', () => {
    const container = document.createElement('div');
    container.textContent = 'abc';
    const range = document.createRange();
    const node = container.firstChild as Text;
    range.setStart(node, 1);
    range.setEnd(node, 1);
    expect(textOffsetsWithin(container, range)).toBeNull();
  });
});
