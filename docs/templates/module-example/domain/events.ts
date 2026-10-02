// Eventos que este módulo publica, registrados no catálogo global (declaration merging).
// Nome no formato `<modulo>.<Evento>`; payload só com dados necessários (IDs, não entidades inteiras).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "example.NoteCreated": { noteId: string };
  }
}

export {};
