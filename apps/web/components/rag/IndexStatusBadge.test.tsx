import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IndexingJob } from '../../lib/types';

const indexDocument = vi.fn<() => Promise<IndexingJob>>();
const getIndexingJob = vi.fn<() => Promise<IndexingJob | null>>();
vi.mock('../../lib/api', () => ({
  indexDocument: () => indexDocument(),
  getIndexingJob: () => getIndexingJob(),
}));

import { IndexStatusBadge } from './IndexStatusBadge';

function job(status: string): IndexingJob {
  return {
    id: 'j',
    document_id: 'd',
    status,
    attempt: 0,
    error_reason: null,
    chunk_count: 2,
    embedding_provider: null,
    embedding_model: null,
    vector_backend: null,
    rag_index_ref: null,
    trace: null,
    elapsed_ms: null,
    created_at: '',
    started_at: null,
    finished_at: null,
  };
}

describe('IndexStatusBadge', () => {
  afterEach(() => vi.clearAllMocks());

  it('offers Index when not indexed and triggers indexing on click', async () => {
    indexDocument.mockResolvedValue(job('uploaded'));
    render(
      <IndexStatusBadge
        documentId="d"
        status="not_indexed"
        ragEnabled
        onStatusChange={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Index' });
    fireEvent.click(btn);
    await waitFor(() => expect(indexDocument).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/queued/i)).toBeInTheDocument();
  });

  it('shows Re-index when already indexed', () => {
    render(
      <IndexStatusBadge documentId="d" status="ready" ragEnabled onStatusChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Re-index' })).toBeInTheDocument();
    expect(screen.getByText('Indexed')).toBeInTheDocument();
  });

  it('reports RAG disabled when disabled', () => {
    render(
      <IndexStatusBadge
        documentId="d"
        status="not_indexed"
        ragEnabled={false}
        onStatusChange={() => {}}
      />,
    );
    expect(screen.getByText(/rag disabled/i)).toBeInTheDocument();
  });
});
