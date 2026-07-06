// IndexedDB CRUD drop-in for apps/web/lib/api/notes.ts.
import type { Note, NoteCreate } from '@web/lib/types';
import { getDb, newId, utcnow } from '../db/db';
import { notFound } from './errors';

export async function createNote(payload: NoteCreate): Promise<Note> {
  const now = utcnow();
  const note: Note = {
    id: newId(),
    document_id: payload.document_id,
    annotation_id: payload.annotation_id ?? null,
    retrieval_run_id: payload.retrieval_run_id ?? null,
    kind: payload.kind ?? 'note',
    body: payload.body,
    created_at: now,
    updated_at: now,
  };
  const db = await getDb();
  await db.put('notes', note);
  return note;
}

export async function listNotes(documentId: string): Promise<Note[]> {
  const db = await getDb();
  const items = await db.getAllFromIndex('notes', 'by_document', documentId);
  items.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return items;
}

export async function updateNote(noteId: string, payload: Partial<NoteCreate>): Promise<Note> {
  const db = await getDb();
  const existing = await db.get('notes', noteId);
  if (!existing) throw notFound('Note');
  const updated: Note = {
    ...existing,
    ...(payload.kind !== undefined ? { kind: payload.kind } : {}),
    ...(payload.body !== undefined ? { body: payload.body } : {}),
    updated_at: utcnow(),
  };
  await db.put('notes', updated);
  return updated;
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await getDb();
  await db.delete('notes', noteId);
}
