// API pública do módulo: composição (injeção de dependências) + o que pode ser usado de fora.
import { CreateNote } from "./features/create-note/create-note.use-case";
import { createNoteRoute } from "./features/create-note/create-note.route";
import { InMemoryNoteRepository } from "./infra/in-memory-note-repository";

const notes = new InMemoryNoteRepository();
const createNote = new CreateNote(notes);

export const notesModule = {
  createNoteRoute: createNoteRoute(createNote),
};

export type { Note } from "./domain/note";
export { CreateNoteForm } from "./features/create-note/ui/create-note-form";
