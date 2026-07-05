'use client';

import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { Annotation } from '../../lib/types';
import { applyAnnotations } from './annotationRendering';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a Markdown/TXT/code/DOCX-text document with inline annotation marks. Markdown is parsed
 * with `marked` and sanitized with DOMPurify (client-only); text/code render as a preformatted block.
 * After each render, saved annotations are located and wrapped in <mark> via applyAnnotations. The
 * container is tagged `data-annotate="markdown"` so the SelectionToolbar can compute stable offsets.
 */
export function MarkdownReader({
  text,
  sourceType,
  annotations,
}: {
  text: string;
  sourceType: string | null;
  annotations: Annotation[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    if (sourceType === 'markdown') {
      const raw = marked.parse(text, { async: false, gfm: true, breaks: false }) as string;
      setHtml(DOMPurify.sanitize(raw));
    } else {
      setHtml(`<pre class="reader-pre">${escapeHtml(text)}</pre>`);
    }
  }, [text, sourceType]);

  const signature = annotations
    .map((a) => `${a.id}:${a.start_offset}:${a.end_offset}`)
    .join('|');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html;
    applyAnnotations(el, annotations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, signature]);

  return <div className="reader-markdown" data-annotate="markdown" ref={ref} />;
}
