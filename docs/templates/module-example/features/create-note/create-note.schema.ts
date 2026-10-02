import { z } from "zod";

export const createNoteSchema = z.object({
  text: z.string().trim().min(1).max(280),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
