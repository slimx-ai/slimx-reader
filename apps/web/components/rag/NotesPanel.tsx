'use client';

import type { Note } from '../../lib/types';
import { EmptyState } from '../common/EmptyState';

const KIND_LABEL: Record<string, string> = {
  note: 'Note',
  evidence: 'Evidence',
  summary: 'Summary',
  explanation: 'Explanation',
  flashcard: 'Flashcard',
};

export function NotesPanel({
  notes,
  onDelete,
}: {
  notes: Note[];
  onDelete: (id: string) => void;
}) {
  if (!notes.length) {
    return (
      <EmptyState title="No saved notes yet">
        Save a retrieved chunk as <strong>evidence</strong> or an answer as a <strong>note</strong>{' '}
        from the Ask tab, and it appears here — source-linked.
      </EmptyState>
    );
  }
  return (
    <ul className="notes-list">
      {notes.map((note) => (
        <li key={note.id} className={`note-item note-item-${note.kind}`}>
          <div className="note-item-head">
            <span className="note-item-kind">{KIND_LABEL[note.kind] ?? note.kind}</span>
            {note.retrieval_run_id ? (
              <span className="note-item-source muted" title="From a retrieval run">
                grounded
              </span>
            ) : null}
            <button
              type="button"
              className="text-button danger"
              onClick={() => onDelete(note.id)}
              aria-label="Delete note"
            >
              Delete
            </button>
          </div>
          <p className="note-item-body">{note.body}</p>
        </li>
      ))}
    </ul>
  );
}
