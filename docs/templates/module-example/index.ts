// API pública do módulo: composição (injeção de dependências) + o que pode ser usado de fora.
import { domainEvents, type ModuleSubscriptions } from "@/shared/events";
import { lazy } from "@/shared/kernel";
import { createNoteRoute } from "./features/create-note/create-note.route";
import { CreateNote } from "./features/create-note/create-note.use-case";
import { InMemoryNoteRepository } from "./infra/in-memory-note-repository";

// `lazy` adia a criação para o primeiro uso (nada de conexão aberta no import).
const notes = lazy(() => new InMemoryNoteRepository());
const createNote = lazy(() => new CreateNote(notes(), domainEvents()));

export const notesModule = {
  // Em src/app/api/notes/route.ts:  export const POST = notesModule.createNoteRoute;
  createNoteRoute: createNoteRoute(createNote),
};

// Opcional: reações a eventos de outros módulos. Registrado em src/instrumentation.ts.
export const subscriptions: ModuleSubscriptions = (bus) => {
  bus.subscribe("example.NoteCreated", (event) => {
    console.info(`nota criada: ${event.payload.noteId}`);
  });
};

export type { Note } from "./domain/note";
export { CreateNoteForm } from "./features/create-note/ui/create-note-form";
