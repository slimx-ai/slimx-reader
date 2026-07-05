import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AskResponse } from '../../lib/types';

const askOverDocuments = vi.fn<() => Promise<AskResponse>>();
vi.mock('../../lib/api', () => ({ askOverDocuments: () => askOverDocuments() }));

import { AskPanel } from './AskPanel';

function response(over: Partial<AskResponse> = {}): AskResponse {
  return {
    run_id: 'r1',
    status: 'succeeded',
    answer: null,
    model_ref: null,
    degraded_reason: null,
    note: null,
    context_used: { chunks_used: 2, top_k: 8, vector_backend: 'memory', elapsed_ms: 12 },
    chunks: [],
    ...over,
  };
}

describe('AskPanel', () => {
  afterEach(() => vi.clearAllMocks());

  it('prompts to index when the document is not indexed', () => {
    render(<AskPanel documentId="d" indexed={false} />);
    expect(screen.getByText(/index this document to ask questions/i)).toBeInTheDocument();
  });

  it('renders the answer, context, and citations on success', async () => {
    askOverDocuments.mockResolvedValue(
      response({
        answer: 'The dimension is 384 [Notes, p. 1].',
        model_ref: 'ollama:llama3.2:3b',
        chunks: [
          {
            rag_chunk_id: 'c0',
            document_id: 'd',
            rank: 0,
            score: 0.82,
            text: 'The embedder dimension is 384.',
            page: 1,
            section: 'Key detail',
            citation: '[Notes, p. 1, Key detail]',
            metadata: { source_title: 'Notes' },
          },
        ],
      }),
    );
    render(<AskPanel documentId="d" indexed />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'What is the dimension?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => {
      expect(screen.getByText('The dimension is 384 [Notes, p. 1].')).toBeInTheDocument();
    });
    expect(screen.getByText('Notes')).toBeInTheDocument(); // citation source title
    expect(screen.getByText(/chunks used/i)).toBeInTheDocument();
    expect(screen.getByText('ollama:llama3.2:3b')).toBeInTheDocument();
  });

  it('shows a degraded banner when no model is available', async () => {
    askOverDocuments.mockResolvedValue(
      response({
        degraded_reason: 'model_unavailable',
        note: 'No model available — showing retrieved context.',
        chunks: [
          {
            rag_chunk_id: 'c0',
            document_id: 'd',
            rank: 0,
            score: 0.4,
            text: 'chunk text',
            page: 2,
            section: null,
            citation: null,
            metadata: {},
          },
        ],
      }),
    );
    render(<AskPanel documentId="d" indexed />);
    fireEvent.change(screen.getByPlaceholderText(/ask a question/i), {
      target: { value: 'q' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => {
      expect(screen.getByText(/no model — retrieved context only/i)).toBeInTheDocument();
    });
    // Low-relevance badge appears for the sub-0.5 chunk.
    expect(screen.getByText(/low relevance/i)).toBeInTheDocument();
  });
});
