import type { Note, NoteWriter } from "../domain/note";

// Adaptador: implementa a porta. Em produção seria, por exemplo, um PostgresNoteRepository
// usando `sql()` de "@/shared/db/sql".
export class InMemoryNoteRepository implements NoteWriter {
  readonly notes: Note[] = [];

  async save(note: Note): Promise<void> {
    this.notes.push(note);
  }

  async existsWithText(text: string): Promise<boolean> {
    return this.notes.some((n) => n.text === text);
  }
}
