// Entidade e porta do domínio: sem dependência de framework ou banco.
export type Note = { id: string; text: string; createdAt: Date };

export interface NoteWriter {
  save(note: Note): Promise<void>;
}
