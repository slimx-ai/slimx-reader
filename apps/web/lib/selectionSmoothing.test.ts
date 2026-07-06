import { describe, expect, it } from 'vitest';
import { smoothSelectionRange } from './selectionSmoothing';

function makeRange(container: HTMLElement): Range {
  document.body.append(container);
  return document.createRange();
}

describe('smoothSelectionRange', () => {
  it('snaps both edges to whole words', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>The quick brown fox</p>';
    const text = container.querySelector('p')!.firstChild as Text;
    const range = makeRange(container);
    range.setStart(text, 5); // inside "quick"
    range.setEnd(text, 7); // inside "quick"
    const changed = smoothSelectionRange(range, container);
    expect(changed).toBe(true);
    expect(range.toString()).toBe('quick');
  });

  it('leaves a whole-word selection untouched', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>alpha beta gamma</p>';
    const text = container.querySelector('p')!.firstChild as Text;
    const range = makeRange(container);
    range.setStart(text, 6); // "beta" start
    range.setEnd(text, 10); // "beta" end
    const changed = smoothSelectionRange(range, container);
    expect(changed).toBe(false);
    expect(range.toString()).toBe('beta');
  });

  it('trims a slight over-drag back into the starting paragraph', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>First paragraph here.</p><p>Second.</p>';
    const [p1, p2] = Array.from(container.querySelectorAll('p'));
    const range = makeRange(container);
    range.setStart(p1.firstChild as Text, 0);
    range.setEnd(p2.firstChild as Text, 2); // barely into the next block
    smoothSelectionRange(range, container);
    expect(range.toString()).toBe('First paragraph here.');
  });

  it('keeps a deliberate multi-paragraph selection', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<p>First paragraph here.</p><p>Second paragraph continues well past the limit.</p>';
    const [p1, p2] = Array.from(container.querySelectorAll('p'));
    const range = makeRange(container);
    range.setStart(p1.firstChild as Text, 0);
    range.setEnd(p2.firstChild as Text, 34); // a large spill into the next block
    smoothSelectionRange(range, container);
    expect(range.toString()).toContain('Second paragraph');
  });

  it('word-snaps without a block root (PDF-style), no paragraph clamp', () => {
    const container = document.createElement('div');
    container.textContent = 'word boundaries matter';
    const text = container.firstChild as Text;
    const range = makeRange(container);
    range.setStart(text, 2); // inside "word"
    range.setEnd(text, 7); // inside "boundaries"
    smoothSelectionRange(range, null);
    expect(range.toString()).toBe('word boundaries');
  });
});
