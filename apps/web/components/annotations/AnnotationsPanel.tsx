'use client';

import type { Annotation } from '../../lib/types';
import { EmptyState } from '../common/EmptyState';

const TYPE_LABEL: Record<string, string> = {
  highlight: 'Highlight',
  comment: 'Comment',
  ask_anchor: 'Ask',
  ai_note: 'AI note',
};

function focusAnnotation(id: string): void {
  const el = document.querySelector<HTMLElement>(`[data-annotation-ids~="${id}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function AnnotationsPanel({
  annotations,
  onDelete,
}: {
  annotations: Annotation[];
  onDelete: (id: string) => void;
}) {
  if (!annotations.length) {
    return (
      <EmptyState title="No annotations yet">
        Select text in the document to <strong>Highlight</strong>, <strong>Comment</strong>, or{' '}
        <strong>Copy</strong>. Your annotations are saved and restored on reload.
      </EmptyState>
    );
  }
  return (
    <ul className="annotations-list">
      {annotations.map((ann) => (
        <li key={ann.id} className={`annotation-item annotation-item-${ann.type}`}>
          <div className="annotation-item-head">
            <span className="annotation-item-type">{TYPE_LABEL[ann.type] ?? ann.type}</span>
            {ann.page ? <span className="annotation-item-page muted">p. {ann.page}</span> : null}
            <button
              type="button"
              className="text-button"
              onClick={() => focusAnnotation(ann.id)}
              title="Scroll to this annotation"
            >
              Find
            </button>
            <button
              type="button"
              className="text-button danger"
              onClick={() => onDelete(ann.id)}
              title="Delete annotation"
            >
              Delete
            </button>
          </div>
          {ann.quote ? <blockquote className="annotation-item-quote">{ann.quote}</blockquote> : null}
          {ann.body ? <p className="annotation-item-body">{ann.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}
