'use client';

import { useEffect, useRef, useState } from 'react';
import type { Annotation } from '../../lib/types';
import { classifyPdfLoadError, type DocumentError } from '../../lib/documentErrors';
import { renderPdfPageOverlay } from './pdfAnnotationOverlay';
import { PdfSidebar } from './PdfSidebar';
import { countMatches, findMatchRanges, normalizeForFind } from './pdfFind';

/**
 * Local-first PDF page viewer. Ported from SlimX-AI ControlRoom's PdfViewer.tsx (MIT).
 *
 * pdf.js is lazy-imported inside the effect so it never loads during SSR and only ships in the PDF
 * chunk; the worker is served from public/ (no CDN). The document loads progressively over HTTP byte
 * ranges, so a long PDF opens on page 1 without pulling the whole file.
 *
 * Long documents (> VIRTUALIZE_PAGE_THRESHOLD pages) are virtualized: every page gets a sized
 * placeholder (so scroll height / page nav / search stay correct), but only pages near the viewport
 * render, and far-away pages are torn down to bound memory. Saved annotations are drawn as rectangles
 * in a separate, non-interactive overlay layer per page — never onto the pdf.js text layer, which
 * stays a pure selection surface.
 */

const VIRTUALIZE_PAGE_THRESHOLD = 20;
const PDF_RANGE_CHUNK_SIZE = 256 * 1024;
const RENDER_ROOT_MARGIN = '1200px 0px';

export function PdfViewer({
  url,
  annotations = [],
}: {
  url: string;
  annotations?: Annotation[];
}) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<DocumentError | null>(null);
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [query, setQuery] = useState<string>('');
  const [findMsg, setFindMsg] = useState<string | null>(null);
  const [searching, setSearching] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<any>(null);
  const pageText = useRef<Map<number, string>>(new Map());
  // Find state: the flat, ordered list of matches ({page, k = kth match on that page}), the active
  // index into it, and the normalized query the list was built for.
  const matchesRef = useRef<Array<{ page: number; k: number }>>([]);
  const matchIdxRef = useRef<number>(-1);
  const lastQueryRef = useRef<string>('');
  const renderSeq = useRef<number>(0);
  const renderedPages = useRef<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const estimatedSize = useRef<{ width: number; height: number } | null>(null);

  // Latest annotations, read through a ref so the render effect and the re-apply effect always paint
  // the current set without capturing a stale closure.
  const annotationsRef = useRef<Annotation[]>(annotations);
  annotationsRef.current = annotations;
  const annotationSignature = annotations
    .map((a) => `${a.id}:${a.start_offset}:${a.end_offset}:${a.pdf_anchor?.rects.length ?? 0}`)
    .join('|');

  function applyPdfAnnotations() {
    const container = scrollRef.current;
    if (!container) return;
    container.querySelectorAll<HTMLElement>('.pdf-viewer-page-canvas').forEach((page) => {
      const textLayer = page.querySelector<HTMLElement>('.pdf-viewer-text-layer');
      const overlay = page.querySelector<HTMLElement>('.pdf-annotation-layer');
      if (textLayer && overlay) renderPdfPageOverlay(page, textLayer, overlay, annotationsRef.current);
    });
    container.dispatchEvent(new CustomEvent('pdf-annotations-painted', { bubbles: true }));
  }

  // Load pdf.js + the document. No page text is extracted here (lazy, on search) so opening a long
  // PDF stays cheap — page 1 shows as soon as the document object resolves.
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    pageText.current = new Map();
    matchesRef.current = [];
    matchIdxRef.current = -1;
    lastQueryRef.current = '';
    renderedPages.current = new Set();
    estimatedSize.current = null;
    (async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist');
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        const doc = await pdfjs
          .getDocument({ url, rangeChunkSize: PDF_RANGE_CHUNK_SIZE })
          .promise;
        if (cancelled) {
          doc.destroy?.();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        setStatus('ready');
      } catch (loadError) {
        if (!cancelled) {
          setError(classifyPdfLoadError(loadError));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
      observerRef.current = null;
      docRef.current?.destroy?.();
      docRef.current = null;
    };
  }, [url, reloadNonce]);

  // Build the page wrappers and render pages. Small PDFs render every page; long PDFs render only
  // near-viewport pages via IntersectionObserver, with sized placeholders for the rest.
  useEffect(() => {
    const doc = docRef.current;
    const container = scrollRef.current;
    if (status !== 'ready' || !doc || !container) return;
    const seq = (renderSeq.current += 1);
    renderedPages.current = new Set();
    observerRef.current?.disconnect();
    observerRef.current = null;
    let cancelled = false;

    async function renderPage(n: number) {
      if (!container || cancelled || seq !== renderSeq.current) return;
      if (renderedPages.current.has(n)) return;
      const wrap = container.querySelector<HTMLElement>(
        `.pdf-viewer-page-canvas[data-page="${n}"]`,
      );
      if (!wrap) return;
      renderedPages.current.add(n); // mark before await so a re-fire during render is a no-op
      const pdfjs: any = await import('pdfjs-dist');
      let page: any;
      try {
        page = await doc.getPage(n);
      } catch {
        renderedPages.current.delete(n);
        return;
      }
      if (cancelled || seq !== renderSeq.current) return;
      const viewport = page.getViewport({ scale });
      if (!estimatedSize.current) {
        estimatedSize.current = { width: viewport.width, height: viewport.height };
      }
      wrap.style.width = `${viewport.width}px`;
      wrap.style.height = `${viewport.height}px`;
      // pdf.js v4 lays out text-layer spans with `calc(var(--scale-factor) * …px)`. Without this
      // variable every span collapses to one spot (a drag selects the whole page). Set it to the scale.
      const scaleFactor = String(viewport.scale ?? scale);
      wrap.style.setProperty('--scale-factor', scaleFactor);
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const overlay = document.createElement('div');
      overlay.className = 'pdf-annotation-layer';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.pointerEvents = 'none';
      const textLayer = document.createElement('div');
      textLayer.className = 'pdf-viewer-text-layer textLayer';
      textLayer.style.setProperty('--scale-factor', scaleFactor);
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      wrap.replaceChildren(canvas, overlay, textLayer);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          await page.render({ canvasContext: ctx, viewport }).promise;
        } catch {
          /* cancelled */
        }
      }
      try {
        const tc = await page.getTextContent();
        await new pdfjs.TextLayer({ textContentSource: tc, container: textLayer, viewport }).render();
      } catch {
        /* text layer is best-effort */
      }
      if (cancelled || seq !== renderSeq.current) return;
      applyPdfAnnotations();
    }

    function teardownPage(n: number) {
      if (!container || !renderedPages.current.has(n)) return;
      const wrap = container.querySelector<HTMLElement>(
        `.pdf-viewer-page-canvas[data-page="${n}"]`,
      );
      renderedPages.current.delete(n);
      wrap?.replaceChildren();
    }

    (async () => {
      container.replaceChildren();
      const width = estimatedSize.current?.width;
      const height = estimatedSize.current?.height;
      const virtualize = doc.numPages > VIRTUALIZE_PAGE_THRESHOLD;
      for (let n = 1; n <= doc.numPages; n += 1) {
        const wrap = document.createElement('div');
        wrap.className = 'pdf-viewer-page-canvas';
        wrap.dataset.page = String(n);
        if (virtualize && width && height) {
          wrap.style.width = `${width}px`;
          wrap.style.height = `${height}px`;
        }
        container.append(wrap);
      }

      if (!virtualize) {
        for (let n = 1; n <= doc.numPages; n += 1) {
          if (cancelled || seq !== renderSeq.current) return;
          await renderPage(n);
        }
        if (!cancelled && seq === renderSeq.current) applyPdfAnnotations();
        return;
      }

      await renderPage(1);
      if (cancelled || seq !== renderSeq.current) return;
      if (estimatedSize.current) {
        container.querySelectorAll<HTMLElement>('.pdf-viewer-page-canvas').forEach((wrap) => {
          if (!wrap.style.height) {
            wrap.style.width = `${estimatedSize.current!.width}px`;
            wrap.style.height = `${estimatedSize.current!.height}px`;
          }
        });
      }
      if (typeof IntersectionObserver === 'undefined') {
        for (let n = 2; n <= doc.numPages; n += 1) {
          if (cancelled || seq !== renderSeq.current) return;
          await renderPage(n);
        }
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (seq !== renderSeq.current) return;
          for (const entry of entries) {
            const n = Number((entry.target as HTMLElement).dataset.page);
            if (!n) continue;
            if (entry.isIntersecting) void renderPage(n);
            else if (n !== 1) teardownPage(n); // keep page 1 mounted
          }
        },
        { root: container, rootMargin: RENDER_ROOT_MARGIN },
      );
      observerRef.current = observer;
      container
        .querySelectorAll<HTMLElement>('.pdf-viewer-page-canvas')
        .forEach((wrap) => observer.observe(wrap));
    })();

    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, scale, numPages]);

  // Re-paint when the annotation set changes without a re-render (e.g. a new highlight arrives).
  useEffect(() => {
    if (status !== 'ready') return;
    applyPdfAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, annotationSignature]);

  // Clear stale find highlights whenever the query text changes (matches rebuild on the next Find).
  useEffect(() => {
    scrollRef.current?.querySelectorAll('.pdf-find-box').forEach((el) => el.remove());
    if (!query.trim()) setFindMsg(null);
  }, [query]);

  function scrollToPage(n: number) {
    scrollRef.current
      ?.querySelector<HTMLElement>(`.pdf-viewer-page-canvas[data-page="${n}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onScroll() {
    const container = scrollRef.current;
    if (!container) return;
    let current = 1;
    container.querySelectorAll<HTMLElement>('.pdf-viewer-page-canvas').forEach((el) => {
      if (el.offsetTop - container.offsetTop <= container.scrollTop + 80) {
        current = Number(el.dataset.page);
      }
    });
    setCurrentPage(current);
  }

  async function ensurePageText(n: number): Promise<string> {
    const cached = pageText.current.get(n);
    if (cached !== undefined) return cached;
    const doc = docRef.current;
    if (!doc) return '';
    try {
      const tc = await (await doc.getPage(n)).getTextContent();
      const text = tc.items.map((item: any) => item.str || '').join(' ');
      pageText.current.set(n, text);
      return text;
    } catch {
      pageText.current.set(n, '');
      return '';
    }
  }

  function clearFindBoxes() {
    scrollRef.current?.querySelectorAll('.pdf-find-box').forEach((el) => el.remove());
  }

  // Wait for a page's text layer to finish rendering (virtualized pages render on scroll).
  async function waitForTextLayer(page: number): Promise<HTMLElement | null> {
    const selector = `.pdf-viewer-page-canvas[data-page="${page}"] .pdf-viewer-text-layer`;
    for (let i = 0; i < 40; i += 1) {
      const layer = scrollRef.current?.querySelector<HTMLElement>(selector);
      if (layer?.querySelector('span')) return layer;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return scrollRef.current?.querySelector<HTMLElement>(selector) ?? null;
  }

  function paintFindBoxes(pageCanvas: HTMLElement, ranges: Range[], current: number) {
    const pageBox = pageCanvas.getBoundingClientRect();
    ranges.forEach((range, ri) => {
      for (const r of Array.from(range.getClientRects())) {
        const box = document.createElement('div');
        box.className = `pdf-find-box${ri === current ? ' current' : ''}`;
        box.style.left = `${r.left - pageBox.left}px`;
        box.style.top = `${r.top - pageBox.top}px`;
        box.style.width = `${r.width}px`;
        box.style.height = `${r.height}px`;
        pageCanvas.appendChild(box);
      }
    });
  }

  async function gotoMatch(index: number) {
    const list = matchesRef.current;
    const match = list[index];
    if (!match) return;
    clearFindBoxes();
    scrollToPage(match.page);
    const layer = await waitForTextLayer(match.page);
    if (!layer) {
      setFindMsg(`${index + 1} / ${list.length}`);
      return;
    }
    const ranges = findMatchRanges(layer, lastQueryRef.current);
    const pageCanvas = layer.closest<HTMLElement>('.pdf-viewer-page-canvas');
    const k = Math.min(match.k, Math.max(0, ranges.length - 1));
    if (pageCanvas && ranges.length) paintFindBoxes(pageCanvas, ranges, k);
    ranges[k]?.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFindMsg(`${index + 1} / ${list.length}`);
  }

  // Enter / Find advance to the next match; Shift+Enter / ‹ go back. The first call for a new query
  // scans every page's text to build the ordered match list; later calls just move the cursor.
  async function find(direction: 1 | -1 = 1) {
    const qNorm = normalizeForFind(query);
    if (!qNorm) {
      clearFindBoxes();
      matchesRef.current = [];
      matchIdxRef.current = -1;
      lastQueryRef.current = '';
      setFindMsg(null);
      return;
    }
    setSearching(true);
    try {
      if (qNorm !== lastQueryRef.current) {
        const list: Array<{ page: number; k: number }> = [];
        for (let n = 1; n <= numPages; n += 1) {
          const count = countMatches(await ensurePageText(n), qNorm);
          for (let k = 0; k < count; k += 1) list.push({ page: n, k });
        }
        matchesRef.current = list;
        matchIdxRef.current = -1;
        lastQueryRef.current = qNorm;
      }
      const list = matchesRef.current;
      if (!list.length) {
        clearFindBoxes();
        setFindMsg('No matches');
        return;
      }
      matchIdxRef.current = (matchIdxRef.current + direction + list.length) % list.length;
      await gotoMatch(matchIdxRef.current);
    } finally {
      setSearching(false);
    }
  }

  if (status === 'error' && error) {
    return (
      <div className="pdf-viewer-error" role="alert">
        <p className="pdf-viewer-error-message">{error.message}</p>
        {error.recovery ? <p className="pdf-viewer-error-recovery muted">{error.recovery}</p> : null}
        <p className="muted">
          The document’s extracted text may still be available in the Text view.
        </p>
        <div className="pdf-viewer-error-actions">
          {error.retryable ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setReloadNonce((n) => n + 1)}
            >
              Retry
            </button>
          ) : null}
          {error.detail ? (
            <button
              type="button"
              className="text-button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((open) => !open)}
            >
              {showDetails ? 'Hide details' : 'Details'}
            </button>
          ) : null}
        </div>
        {showDetails && error.detail ? (
          <pre className="pdf-viewer-error-details" data-error-code={error.code}>
            {error.code}
            {error.status ? ` · HTTP ${error.status}` : ''}
            {`\n${error.detail}`}
          </pre>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-toolbar" role="toolbar" aria-label="PDF controls">
        <button
          type="button"
          className="secondary-button"
          aria-label="Toggle thumbnails and outline"
          aria-pressed={showSidebar}
          title="Thumbnails & outline"
          onClick={() => setShowSidebar((s) => !s)}
        >
          ☰
        </button>
        <span className="pdf-viewer-page">
          {status === 'loading' ? 'Loading…' : `Page ${currentPage} / ${numPages}`}
        </span>
        <span className="pdf-viewer-sep" aria-hidden="true" />
        <button
          type="button"
          className="secondary-button"
          aria-label="Zoom out"
          onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}
        >
          −
        </button>
        <span className="pdf-viewer-zoom">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="secondary-button"
          aria-label="Zoom in"
          onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))}
        >
          +
        </button>
        <button
          type="button"
          className="secondary-button"
          aria-label="Reset zoom"
          onClick={() => setScale(1.2)}
        >
          Reset
        </button>
        <span className="pdf-viewer-sep" aria-hidden="true" />
        <input
          type="search"
          className="pdf-viewer-search"
          aria-label="Search the PDF text"
          placeholder="Find in document…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void find(event.shiftKey ? -1 : 1);
            }
          }}
        />
        <button
          type="button"
          className="secondary-button"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={searching || !query.trim()}
          onClick={() => void find(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="secondary-button"
          title="Next match (Enter)"
          disabled={searching}
          onClick={() => void find(1)}
        >
          {searching ? 'Finding…' : 'Find'}
        </button>
        {findMsg ? <span className="pdf-viewer-find-msg muted">{findMsg}</span> : null}
      </div>
      <div className="pdf-viewer-body">
        {showSidebar ? (
          <PdfSidebar
            doc={status === 'ready' ? docRef.current : null}
            numPages={numPages}
            currentPage={currentPage}
            onNavigate={scrollToPage}
          />
        ) : null}
        <div className="pdf-viewer-page-wrap" ref={scrollRef} onScroll={onScroll} dir="auto">
          {status === 'loading' ? (
            <p className="muted" role="status">
              Loading PDF…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
