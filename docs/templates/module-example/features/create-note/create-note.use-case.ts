import type { Note, NoteWriter } from "../../domain/note";
import type { CreateNoteInput } from "./create-note.schema";

// Caso de uso: uma responsabilidade, dependências injetadas (DIP).
export class CreateNote {
  constructor(
    private readonly notes: NoteWriter,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: CreateNoteInput): Promise<Note> {
    const note: Note = { id: this.newId(), text: input.text, createdAt: this.now() };
    await this.notes.save(note);
    return note;
  }
}
