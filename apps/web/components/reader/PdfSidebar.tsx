'use client';

import { useEffect, useRef, useState } from 'react';

// Left navigation rail for the PDF viewer: page thumbnails and the document outline (bookmarks).
// It reads everything from the pdf.js document proxy passed in (getPage/getOutline/getDestination/
// getPageIndex), so it needs no pdfjs import of its own.

const THUMB_WIDTH = 140;

type OutlineNode = {
  title: string;
  dest: unknown;
  url?: string | null;
  items?: OutlineNode[];
};

export function PdfSidebar({
  doc,
  numPages,
  currentPage,
  onNavigate,
}: {
  doc: any;
  numPages: number;
  currentPage: number;
  onNavigate: (page: number) => void;
}) {
  const [tab, setTab] = useState<'thumbnails' | 'outline'>('thumbnails');
  const [outline, setOutline] = useState<OutlineNode[] | null | undefined>(undefined);
  const thumbRootRef = useRef<HTMLDivElement | null>(null);
  const rendered = useRef<Set<number>>(new Set());

  // Load the outline once the document is available.
  useEffect(() => {
    if (!doc || typeof doc.getOutline !== 'function') {
      setOutline(null);
      return;
    }
    let cancelled = false;
    setOutline(undefined);
    doc
      .getOutline()
      .then((o: OutlineNode[] | null) => !cancelled && setOutline(o ?? null))
      .catch(() => !cancelled && setOutline(null));
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // Lazily render page thumbnails as they scroll into the rail.
  useEffect(() => {
    if (tab !== 'thumbnails' || !doc || !numPages) return;
    const root = thumbRootRef.current;
    if (!root) return;
    rendered.current = new Set();

    const renderThumb = async (n: number) => {
      if (rendered.current.has(n)) return;
      rendered.current.add(n);
      const holder = root.querySelector<HTMLElement>(`[data-thumb="${n}"]`);
      if (!holder) return;
      try {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
        holder.replaceChildren(canvas);
      } catch {
        rendered.current.delete(n); // allow a retry on the next intersection
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      for (let n = 1; n <= numPages; n += 1) void renderThumb(n);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) void renderThumb(Number((e.target as HTMLElement).dataset.thumb));
        }
      },
      { root, rootMargin: '300px 0px' },
    );
    root.querySelectorAll<HTMLElement>('[data-thumb]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tab, doc, numPages]);

  // Keep the active thumbnail visible as the main view scrolls.
  useEffect(() => {
    if (tab !== 'thumbnails') return;
    thumbRootRef.current
      ?.querySelector(`[data-thumb="${currentPage}"]`)
      ?.parentElement?.scrollIntoView({ block: 'nearest' });
  }, [currentPage, tab]);

  const goToDest = async (dest: unknown) => {
    try {
      const resolved = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(resolved) || resolved[0] == null) return;
      const index = await doc.getPageIndex(resolved[0]);
      onNavigate(index + 1);
    } catch {
      /* unresolvable destination — ignore */
    }
  };

  return (
    <aside className="pdf-sidebar" aria-label="Document navigation">
      <div className="pdf-sidebar-tabs" role="tablist" aria-label="Sidebar view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'thumbnails'}
          className={tab === 'thumbnails' ? 'active' : ''}
          title="Page thumbnails"
          onClick={() => setTab('thumbnails')}
        >
          ▦
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'outline'}
          className={tab === 'outline' ? 'active' : ''}
          title="Document outline"
          onClick={() => setTab('outline')}
        >
          ☰
        </button>
      </div>

      {tab === 'thumbnails' ? (
        <div className="pdf-thumbs" ref={thumbRootRef}>
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`pdf-thumb${n === currentPage ? ' active' : ''}`}
              onClick={() => onNavigate(n)}
              aria-label={`Go to page ${n}`}
              aria-current={n === currentPage ? 'page' : undefined}
            >
              <span className="pdf-thumb-canvas" data-thumb={n} />
              <span className="pdf-thumb-num">{n}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="pdf-outline">
          {outline === undefined ? (
            <p className="muted pdf-sidebar-empty">Loading outline…</p>
          ) : !outline || !outline.length ? (
            <p className="muted pdf-sidebar-empty">This document has no outline.</p>
          ) : (
            <OutlineTree nodes={outline} onSelect={goToDest} />
          )}
        </div>
      )}
    </aside>
  );
}

function OutlineTree({
  nodes,
  onSelect,
}: {
  nodes: OutlineNode[];
  onSelect: (dest: unknown) => void;
}) {
  return (
    <ul className="pdf-outline-list">
      {nodes.map((node, i) => (
        <li key={i}>
          <button type="button" className="pdf-outline-item" onClick={() => onSelect(node.dest)}>
            {node.title || '(untitled)'}
          </button>
          {node.items?.length ? <OutlineTree nodes={node.items} onSelect={onSelect} /> : null}
        </li>
      ))}
    </ul>
  );
}
