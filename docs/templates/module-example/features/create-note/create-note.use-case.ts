import type { DomainEventPublisher } from "@/shared/events";
import { ConflictError, err, ok, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { Note, NoteWriter } from "../../domain/note";
import type { CreateNoteInput } from "./create-note.schema";

// Caso de uso: uma responsabilidade, dependências injetadas (DIP), falhas esperadas como Result.
export class CreateNote {
  constructor(
    private readonly notes: NoteWriter,
    private readonly events: DomainEventPublisher,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(input: CreateNoteInput): Promise<Result<Note, ConflictError>> {
    if (await this.notes.existsWithText(input.text)) {
      return err(new ConflictError("Já existe uma nota com esse texto."));
    }
    const note: Note = { id: this.newId(), text: input.text, createdAt: this.now() };
    await this.notes.save(note);
    await this.events.publish("example.NoteCreated", { noteId: note.id });
    return ok(note);
  }
}
