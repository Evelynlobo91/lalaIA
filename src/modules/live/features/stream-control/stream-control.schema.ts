import { z } from "zod";
import { STREAM_ACTIONS } from "../../domain/stream";

/** Ativar, pausar ou encerrar uma transmissão (portal). */
export const streamControlSchema = z.object({
  streamId: z.uuid(),
  action: z.enum(STREAM_ACTIONS),
});

/** Payload de `events.EventCancelled` (validado: vem de outro módulo). */
export const eventCancelledSchema = z.object({ eventId: z.uuid() });
