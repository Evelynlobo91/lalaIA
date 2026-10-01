import { z } from "zod";
import { entityTypes } from "../../domain/favorite";

/** Corpo de POST /api/favorites/want-to-go. Nenhum dado pessoal: quem clicou vem da sessão (ou ninguém). */
export const wantToGoSchema = z.object({
  entityType: z.enum(entityTypes),
  entityId: z.uuid(),
});

export type WantToGoInput = z.infer<typeof wantToGoSchema>;
