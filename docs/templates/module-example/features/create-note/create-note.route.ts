import { jsonRoute } from "@/shared/http/json-route";
import { createNoteSchema } from "./create-note.schema";
import type { CreateNote } from "./create-note.use-case";

// Adaptador HTTP: validação + tradução Result → Response ficam no jsonRoute do kernel.
export function createNoteRoute(createNote: () => CreateNote) {
  return jsonRoute(createNoteSchema, (input) => createNote().execute(input), { successStatus: 201 });
}
