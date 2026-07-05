import type { Note, NoteCreate } from '../types';
import { apiFetch } from './http';

export async function createNote(payload: NoteCreate): Promise<Note> {
  return apiFetch<Note>('/api/notes', { method: 'POST', body: JSON.stringify(payload) });
}

export async function listNotes(documentId: string): Promise<Note[]> {
  return apiFetch<Note[]>(`/api/documents/${documentId}/notes`);
}

export async function updateNote(noteId: string, payload: Partial<NoteCreate>): Promise<Note> {
  return apiFetch<Note>(`/api/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteNote(noteId: string): Promise<void> {
  await apiFetch<void>(`/api/notes/${noteId}`, { method: 'DELETE' });
}
