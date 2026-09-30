import type { Note, NoteWriter } from "../domain/note";

// Adaptador: implementa a porta. Em produção seria, por exemplo, um SupabaseNoteRepository.
export class InMemoryNoteRepository implements NoteWriter {
  readonly notes: Note[] = [];

  async save(note: Note): Promise<void> {
    this.notes.push(note);
  }
}
