'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The in-app box for annotating a passage (a native textarea, not a browser prompt), positioned at
 * fixed coordinates near the text. One input, two intents: save the text as a **Comment** (blue), or
 * — when `onAsk` is provided — send it as a grounded **Ask** (green) whose question and answer stay
 * attached to the passage.
 */
export function CommentComposer({
  quote,
  top,
  left,
  initial = '',
  onSave,
  onAsk,
  askDisabledReason,
  onCancel,
}: {
  quote: string;
  top: number;
  left: number;
  initial?: string;
  onSave: (body: string) => void;
  /** When set, an "Ask" action is offered next to "Comment". */
  onAsk?: (question: string) => void;
  /** When set (e.g. document not indexed), the Ask button renders disabled with this tooltip. */
  askDisabledReason?: string | null;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const body = draft.trim();
  const submitComment = () => {
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
        placeholder={onAsk ? 'Comment on — or ask about — this passage…' : 'Add a comment…'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitComment();
          }
        }}
      />
      <div className="comment-composer-actions">
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button btn-comment"
          disabled={!body}
          title="Save as a comment (⌘/Ctrl+Enter)"
          onClick={submitComment}
        >
          Comment
        </button>
        {onAsk ? (
          <button
            type="button"
            className="primary-button btn-ask"
            disabled={!body || !!askDisabledReason}
            title={askDisabledReason ?? 'Ask about this passage — the answer stays attached to it'}
            onClick={() => {
              if (body) onAsk(body);
            }}
          >
            Ask
          </button>
        ) : null}
      </div>
    </div>
  );
}
