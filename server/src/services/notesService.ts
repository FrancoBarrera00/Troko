import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { EventBus } from '../eventBus.ts';
import { HttpError } from '../app.ts';

export interface QuickNote {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export class NotesService {
  private readonly filePath: string | null;
  private readonly eventBus: EventBus;
  private notes: QuickNote[] = [];

  constructor(dbPath: string, eventBus: EventBus) {
    this.eventBus = eventBus;
    this.filePath =
      dbPath && dbPath !== ':memory:'
        ? path.join(path.dirname(path.resolve(dbPath)), 'quick-notes.json')
        : null;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      this.notes = [];
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        this.notes = parsed.filter(
          (item): item is QuickNote =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as QuickNote).id === 'string' &&
            typeof (item as QuickNote).content === 'string'
        );
      }
    } catch {
      this.notes = [];
    }
  }

  private saveToDisk(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.notes, null, 2), 'utf8');
    } catch {
      // Ignore write failures on transient paths
    }
  }

  listNotes(): QuickNote[] {
    return [...this.notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  createNote(content: string, pinned = false): QuickNote {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new HttpError(400, 'El contenido de la nota es obligatorio');
    }
    const nowIso = new Date().toISOString();
    const note: QuickNote = {
      id: `note-${crypto.randomUUID()}`,
      content: trimmed.slice(0, 2000),
      pinned: Boolean(pinned),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.notes.unshift(note);
    this.saveToDisk();
    this.eventBus.publish('data.updated', { scope: 'notes', noteId: note.id });
    return note;
  }

  updateNote(id: string, patch: { content?: string; pinned?: boolean }): QuickNote {
    const idx = this.notes.findIndex((n) => n.id === id);
    if (idx === -1) {
      throw new HttpError(404, 'Nota no encontrada');
    }
    const current = this.notes[idx]!;
    const nextContent =
      typeof patch.content === 'string' && patch.content.trim().length > 0
        ? patch.content.trim().slice(0, 2000)
        : current.content;
    const nextPinned =
      typeof patch.pinned === 'boolean' ? patch.pinned : current.pinned;
    const updated: QuickNote = {
      ...current,
      content: nextContent,
      pinned: nextPinned,
      updatedAt: new Date().toISOString(),
    };
    this.notes[idx] = updated;
    this.saveToDisk();
    this.eventBus.publish('data.updated', { scope: 'notes', noteId: id });
    return updated;
  }

  deleteNote(id: string): void {
    const before = this.notes.length;
    this.notes = this.notes.filter((n) => n.id !== id);
    if (this.notes.length === before) {
      throw new HttpError(404, 'Nota no encontrada');
    }
    this.saveToDisk();
    this.eventBus.publish('data.updated', { scope: 'notes', noteId: id });
  }

  clearNotes(): void {
    this.notes = [];
    this.saveToDisk();
    this.eventBus.publish('data.updated', { scope: 'notes' });
  }
}
