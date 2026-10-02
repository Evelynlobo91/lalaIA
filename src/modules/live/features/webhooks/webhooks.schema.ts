import { z } from "zod";

/** Webhooks do Mux têm poucos KB; acima disto, recusamos sem ler/verificar (anti-DoS). */
export const MAX_WEBHOOK_BYTES = 64 * 1024;

/** Evento já normalizado pelo adaptador: validado de novo antes de tocar no banco (defesa em profundidade). */
export const providerEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  providerStreamId: z.string().min(1).max(200),
  kind: z.enum(["connected", "active", "disconnected", "idle", "enabled", "disabled"]),
  occurredAt: z.date(),
});
