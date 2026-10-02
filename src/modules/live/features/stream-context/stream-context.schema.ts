import { z } from "zod";
import { STREAM_NOTE_MAX } from "../../domain/stream";

/** Situação atual (#53): uma linha curta; espaços e quebras de linha viram um espaço; vazio = limpar. */
export const streamNoteSchema = z.object({
  streamId: z.uuid(),
  note: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(STREAM_NOTE_MAX, `Use até ${STREAM_NOTE_MAX} caracteres.`))
    .transform((v) => (v === "" ? null : v)),
});
