'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AnnotationCreate } from '../../lib/types';
import { readSelection, type SelectionInfo } from '../../lib/selection';

/**
 * A floating toolbar that appears over a text selection inside the reader surface and offers
 * Highlight / Comment / Ask / Copy. It reads the selection itself (pdf.js text layer or a
 * `data-annotate="markdown"` container) and hands a fully-formed annotation payload to `onCreate`.
 */
export function SelectionToolbar({
  onCreate,
  onAsk,
}: {
  onCreate: (payload: AnnotationCreate) => void;
  onAsk?: (quote: string) => void;
}) {
  const [info, setInfo] = useState<SelectionInfo | null>(null);

  const refresh = useCallback(() => {
    // Defer a tick so the browser has committed the selection after mouseup.
    window.setTimeout(() => setInfo(readSelection()), 0);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', refresh);
    document.addEventListener('keyup', refresh);
    return () => {
      document.removeEventListener('mouseup', refresh);
      document.removeEventListener('keyup', refresh);
    };
  }, [refresh]);

  if (!info) return null;

  const { quote, rect, anchor } = info;
  const top = Math.max(8, rect.top - 44);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 320));

  const create = (type: AnnotationCreate['type'], body?: string) => {
    onCreate({ type, quote, body: body ?? null, ...anchor });
    window.getSelection()?.removeAllRanges();
    setInfo(null);
  };

  return (
    <div
      className="selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      style={{ position: 'fixed', top, left, zIndex: 50 }}
      // Keep the selection alive when clicking a button.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="selection-toolbar-button"
        onClick={() => create('highlight')}
      >
        Highlight
      </button>
      <button
        type="button"
        className="selection-toolbar-button"
        onClick={() => {
          const body = window.prompt('Comment on the selected text:');
          if (body != null) create('comment', body);
        }}
      >
        Comment
      </button>
      {onAsk ? (
        <button
          type="button"
          className="selection-toolbar-button"
          onClick={() => {
            create('ask_anchor');
            onAsk(quote);
          }}
        >
          Ask
        </button>
      ) : null}
      <button
        type="button"
        className="selection-toolbar-button"
        onClick={() => {
          void navigator.clipboard?.writeText(quote);
          window.getSelection()?.removeAllRanges();
          setInfo(null);
        }}
      >
        Copy
      </button>
    </div>
  );
}
