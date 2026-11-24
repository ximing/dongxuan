import { Service } from '@rabjs/react';
import type { NoteRecord } from '@dongxuan/dto';
import { createNote, deleteNote, patchNote } from '@/api/notes';
import { PagedList } from '@/lib/paged-list';
import { errorMessage } from '@/lib/format';
import { DialogService } from '@/services/dialog.service';

export class NotesService extends Service {
  notes = new PagedList<NoteRecord>();
  body = '';
  editing: NoteRecord | null = null;
  error = '';
  pending = false;
  chartId: string | undefined;
  snapshotId: string | undefined;

  get dialog(): DialogService {
    return this.resolve(DialogService);
  }

  open(chartId?: string, snapshotId?: string): void {
    this.chartId = chartId;
    this.snapshotId = snapshotId;
    this.editing = null;
    this.body = '';
    this.error = '';
    const path = chartId || snapshotId
      ? `/api/v2/notes?${chartId ? `chartId=${chartId}` : `snapshotId=${snapshotId}`}`
      : null;
    this.notes.reload(path);
  }

  setBody(value: string): void {
    this.body = value;
  }

  edit(note: NoteRecord): void {
    this.editing = note;
    this.body = note.body;
  }

  cancelEdit(): void {
    this.editing = null;
    this.body = '';
  }

  async save(): Promise<void> {
    this.error = '';
    this.pending = true;
    const editing = this.editing;
    try {
      const saved = await (editing
        ? patchNote(editing.id, { body: this.body, revision: editing.revision })
        : createNote({ body: this.body, ...(this.chartId ? { chartId: this.chartId } : { snapshotId: this.snapshotId }) }));
      this.notes.setItems(editing ? this.notes.items.map((note) => note.id === saved.id ? saved : note) : [saved, ...this.notes.items]);
      this.body = '';
      this.editing = null;
    } catch (error) {
      this.error = errorMessage(error);
    } finally {
      this.pending = false;
    }
  }

  async remove(note: NoteRecord): Promise<void> {
    if (!await this.dialog.confirm('删除这条笔记？')) return;
    try {
      await deleteNote(note.id, note.revision);
      this.notes.setItems(this.notes.items.filter((item) => item.id !== note.id));
    } catch (error) {
      this.error = errorMessage(error);
    }
  }
}
