import type { CreateNote } from "./create-note.use-case";
import { createNoteSchema } from "./create-note.schema";

// Adaptador HTTP: traduz Request → caso de uso → Response. Sem regra de negócio.
export function createNoteRoute(createNote: CreateNote) {
  return async function POST(request: Request): Promise<Response> {
    const parsed = createNoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues }, { status: 400 });
    }
    const note = await createNote.execute(parsed.data);
    return Response.json(note, { status: 201 });
  };
}
