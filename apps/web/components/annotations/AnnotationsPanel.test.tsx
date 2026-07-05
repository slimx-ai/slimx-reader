import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Annotation } from '../../lib/types';
import { AnnotationsPanel } from './AnnotationsPanel';

function ann(partial: Partial<Annotation> & { id: string }): Annotation {
  return {
    document_id: 'd',
    type: 'highlight',
    quote: 'the selected text',
    start_offset: null,
    end_offset: null,
    page: null,
    color: null,
    body: null,
    labels: [],
    pdf_anchor: null,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('AnnotationsPanel', () => {
  it('shows an empty state when there are no annotations', () => {
    render(<AnnotationsPanel annotations={[]} onDelete={() => {}} />);
    expect(screen.getByText(/no annotations yet/i)).toBeInTheDocument();
  });

  it('lists annotations and deletes on click', () => {
    const onDelete = vi.fn();
    render(
      <AnnotationsPanel
        annotations={[ann({ id: 'a1', type: 'comment', body: 'my note' })]}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByText('Comment')).toBeInTheDocument();
    expect(screen.getByText('my note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('a1');
  });
});
