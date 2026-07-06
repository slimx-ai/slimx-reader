'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A small in-app comment box (a native textarea, not a browser prompt), positioned at fixed
 * coordinates near the text it annotates. Used both when commenting a fresh selection and when
 * commenting an existing highlight.
 */
export function CommentComposer({
  quote,
  top,
  left,
  initial = '',
  onSave,
  onCancel,
}: {
  quote: string;
  top: number;
  left: number;
  initial?: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = () => {
    const body = draft.trim();
    if (body) onSave(body);
  };

  return (
    <div className="comment-composer" style={{ position: 'fixed', top, left, zIndex: 55 }}>
      {quote ? <blockquote className="comment-composer-quote">{quote}</blockquote> : null}
      <textarea
        ref={ref}
        className="comment-composer-input"
        value={draft}
        rows={3}
        placeholder="Add a comment…  (⌘/Ctrl+Enter to save)"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="comment-composer-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary-button" disabled={!draft.trim()} onClick={submit}>
          Comment
        </button>
      </div>
    </div>
  );
}
