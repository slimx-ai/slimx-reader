import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../lib/types';
import { MarkdownReader } from './MarkdownReader';

function ann(quote: string, type: Annotation['type'] = 'highlight'): Annotation {
  return {
    id: 'a1',
    document_id: 'd',
    type,
    quote,
    start_offset: null,
    end_offset: null,
    page: null,
    color: null,
    body: null,
    labels: [],
    pdf_anchor: null,
    created_at: '',
    updated_at: '',
  };
}

describe('MarkdownReader', () => {
  it('renders text and applies a highlight mark for a matching quote', async () => {
    const { container } = render(
      <MarkdownReader text="Hello quick brown fox" sourceType="text" annotations={[ann('quick brown')]} />,
    );
    await waitFor(() => {
      const mark = container.querySelector('mark.annotation-highlight');
      expect(mark).not.toBeNull();
      expect(mark!.getAttribute('data-annotation-ids')).toBe('a1');
    });
    expect(container.querySelector('[data-annotate="markdown"]')).not.toBeNull();
  });

  it('renders markdown headings as HTML', async () => {
    const { container } = render(
      <MarkdownReader text={'# Title\n\nbody'} sourceType="markdown" annotations={[]} />,
    );
    await waitFor(() => {
      expect(container.querySelector('h1')?.textContent).toBe('Title');
    });
  });
});
