import { z } from "zod";

/**
 * Eventos que a TELA pode enviar: só visualizações. Favoritar, "Quero ir" e check-in vêm dos
 * eventos de domínio dos próprios módulos (não dá para forjá-los pelo endpoint).
 */
export const trackUiSchema = z.object({
  kind: z.enum(["view", "live_view"]),
  entityType: z.enum(["place", "event", "live"]),
  entityId: z.uuid(),
});

export type TrackUiInput = z.infer<typeof trackUiSchema>;
