import type { NoteRecord } from '@dongxuan/dto';
import { api } from './client';

export function createNote(body: object): Promise<NoteRecord> {
  return api<NoteRecord>('/api/v2/notes', { method: 'POST', body: JSON.stringify(body) });
}

export function patchNote(id: string, body: object): Promise<NoteRecord> {
  return api<NoteRecord>(`/api/v2/notes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteNote(id: string, revision: number): Promise<void> {
  return api(`/api/v2/notes/${id}?revision=${revision}`, { method: 'DELETE' });
}
