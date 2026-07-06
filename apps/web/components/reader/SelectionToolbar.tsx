'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '../../lib/clipboard';
import type { AnnotationCreate } from '../../lib/types';
import { HIGHLIGHT_COLORS } from '../../lib/highlightColors';
import { readSelection, type SelectionInfo } from '../../lib/selection';
import { CommentComposer } from './CommentComposer';

// Toolbar width used to decide whether it fits to the right of the selection or must flip left.
const TOOLBAR_W = 176;

/**
 * A floating toolbar that appears beside a text selection inside the reader surface. It offers a row
 * of highlight colors (click a swatch to highlight in that color), one Comment/Ask entry, and Copy.
 * It reads the selection itself (pdf.js text layer or a `data-annotate="markdown"` container) and
 * hands a fully-formed annotation payload to `onCreate`.
 *
 * Comment/Ask opens one composer with two intents: save as a comment, or ask a grounded question
 * whose Q&A stays anchored to the passage (an `ask_anchor` annotation — the reader runs the ask).
 * While composing, global mouseup/keyup are ignored so the composer stays put.
 */
export function SelectionToolbar({
  onCreate,
  askDisabledReason,
}: {
  onCreate: (payload: AnnotationCreate) => void;
  /** When set (e.g. document not indexed yet), the composer's Ask is disabled with this tooltip. */
  askDisabledReason?: string | null;
}) {
  const [info, setInfo] = useState<SelectionInfo | null>(null);
  const [mode, setMode] = useState<'actions' | 'compose'>('actions');
  // Read synchronously by the deferred selection handler so a just-clicked "Comment" isn't undone.
  const modeRef = useRef<'actions' | 'compose'>('actions');

  const setModeSync = (next: 'actions' | 'compose') => {
    modeRef.current = next;
    setMode(next);
  };

  const refresh = useCallback((smooth: boolean) => {
    // Defer a tick so the browser has committed the selection after mouseup/keyup.
    window.setTimeout(() => {
      if (modeRef.current === 'compose') return; // don't tear down an open composer
      setInfo(readSelection({ smooth }));
    }, 0);
  }, []);

  useEffect(() => {
    // Mouse drags get smoothing (word-snap + paragraph containment); keyboard selections don't.
    const onMouseUp = () => refresh(true);
    const onKeyUp = () => refresh(false);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [refresh]);

  if (!info) return null;

  const { quote, rect, anchor } = info;

  const dismiss = () => {
    setInfo(null);
    setModeSync('actions');
  };

  const create = (type: AnnotationCreate['type'], body?: string, color?: string) => {
    onCreate({ type, quote, body: body ?? null, color: color ?? null, ...anchor });
    window.getSelection()?.removeAllRanges();
    dismiss();
  };

  // Place the toolbar to the right of the selection; flip left if it would overflow the viewport.
  const fitsRight = rect.right + 8 + TOOLBAR_W <= window.innerWidth - 8;
  const left = fitsRight
    ? rect.right + 8
    : Math.max(8, rect.left - TOOLBAR_W - 8);
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - 120));

  if (mode === 'compose') {
    const cTop = Math.min(rect.bottom + 8, window.innerHeight - 180);
    const cLeft = Math.max(8, Math.min(rect.left, window.innerWidth - 320));
    return (
      <CommentComposer
        quote={quote}
        top={cTop}
        left={cLeft}
        onSave={(body) => create('comment', body)}
        onAsk={(question) => create('ask_anchor', question)}
        askDisabledReason={askDisabledReason}
        onCancel={dismiss}
      />
    );
  }

  return (
    <div
      className="selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      style={{ position: 'fixed', top, left, zIndex: 50 }}
      // Keep the selection alive when clicking a button.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="swatch-row" role="group" aria-label="Highlight color">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            className="swatch"
            style={{ background: c.swatch }}
            aria-label={`Highlight ${c.label}`}
            title={`Highlight ${c.label}`}
            onClick={() => create('highlight', undefined, c.key)}
          />
        ))}
      </div>
      <div className="selection-toolbar-actions">
        <button
          type="button"
          className="selection-toolbar-button"
          onClick={() => setModeSync('compose')}
        >
          Comment / Ask
        </button>
        <button
          type="button"
          className="selection-toolbar-button"
          onClick={() => {
            void copyText(quote);
            window.getSelection()?.removeAllRanges();
            dismiss();
          }}
        >
          Copy
        </button>
      </div>
    </div>
  );
}
