import { z } from "zod";

/**
 * Eventos que a TELA pode enviar: visualizações e, nas lives, a chamada do anfitrião que apareceu ou foi tocada
 * (#182). Favoritar, "Quero ir" e check-in vêm dos eventos de domínio dos próprios módulos (não dá para
 * forjá-los pelo endpoint).
 */
export const trackUiSchema = z.union([
  z.object({
    kind: z.enum(["view", "live_view"]),
    entityType: z.enum(["place", "event", "live"]),
    entityId: z.uuid(),
  }),
  z.object({
    kind: z.enum(["cta_impression", "cta_click"]),
    entityType: z.literal("cta"),
    entityId: z.uuid(),
  }),
]);

export type TrackUiInput = z.infer<typeof trackUiSchema>;
