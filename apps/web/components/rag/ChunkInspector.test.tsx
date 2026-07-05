import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentChunksResponse } from '../../lib/types';

const listDocumentChunks = vi.fn<() => Promise<DocumentChunksResponse>>();
vi.mock('../../lib/api', () => ({ listDocumentChunks: () => listDocumentChunks() }));

import { ChunkInspector } from './ChunkInspector';

function chunksResponse(over: Partial<DocumentChunksResponse> = {}): DocumentChunksResponse {
  return { document_id: 'd', status: 'ready', chunk_count: 0, chunks: [], ...over };
}

describe('ChunkInspector', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders indexed chunks with page/section', async () => {
    listDocumentChunks.mockResolvedValue(
      chunksResponse({
        chunk_count: 1,
        chunks: [
          {
            rag_chunk_id: 'c0',
            ordinal: 0,
            text: 'The embedder dimension is 384.',
            page: 3,
            section: 'Key detail',
            start_offset: null,
            end_offset: null,
            section_path: null,
            parent_id: null,
            page_type: null,
            token_count: 8,
          },
        ],
      }),
    );
    render(<ChunkInspector documentId="d" />);
    await waitFor(() => {
      expect(screen.getByText(/The embedder dimension is 384/)).toBeInTheDocument();
    });
    expect(screen.getByText('Chunk #1')).toBeInTheDocument();
    expect(screen.getByText('p. 3')).toBeInTheDocument();
  });

  it('shows a not-indexed empty state', async () => {
    listDocumentChunks.mockResolvedValue(chunksResponse({ status: 'not_indexed' }));
    render(<ChunkInspector documentId="d" />);
    await waitFor(() => {
      expect(screen.getByText(/not indexed yet/i)).toBeInTheDocument();
    });
  });

  it('shows a RAG-unavailable message', async () => {
    listDocumentChunks.mockResolvedValue(chunksResponse({ status: 'unavailable' }));
    render(<ChunkInspector documentId="d" />);
    await waitFor(() => {
      expect(screen.getByText(/slimx-rag is unavailable/i)).toBeInTheDocument();
    });
  });
});
