import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock pdf.js so the viewer's lazy `import('pdfjs-dist')` resolves to a deterministic fake.
const makePage = () => ({
  getViewport: () => ({ width: 200, height: 300, scale: 1.2 }),
  render: () => ({ promise: Promise.resolve() }),
  getTextContent: () => Promise.resolve({ items: [] }),
});

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 25,
      getPage: async () => makePage(),
      destroy() {},
    }),
  }),
  TextLayer: class {
    render() {
      return Promise.resolve();
    }
  },
}));

import { PdfViewer } from './PdfViewer';

describe('PdfViewer', () => {
  beforeEach(() => {
    // jsdom has no 2D canvas; return null so the render path is skipped cleanly.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // No IntersectionObserver in jsdom -> the viewer eager-renders every page (its documented fallback).
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the toolbar and a loading state initially', () => {
    render(<PdfViewer url="/api/documents/x/file" annotations={[]} />);
    expect(screen.getByRole('toolbar', { name: /pdf controls/i })).toBeInTheDocument();
    expect(screen.getByText('Loading PDF…')).toBeInTheDocument();
  });

  it('builds a sized placeholder wrapper for every page of a long PDF', async () => {
    const { container } = render(<PdfViewer url="/api/documents/x/file" annotations={[]} />);
    await waitFor(() => {
      const wraps = container.querySelectorAll('.pdf-viewer-page-canvas');
      expect(wraps.length).toBe(25);
    });
    // Page count reflects the loaded document.
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });
});
