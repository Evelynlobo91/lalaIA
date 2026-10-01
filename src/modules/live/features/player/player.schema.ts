import { z } from "zod";
import { STREAM_ENTITY_TYPES } from "../../domain/stream";

/** Lugar ou evento cuja live se quer assistir (página pública, endpoint de status). */
export const liveTargetSchema = z.object({
  entityType: z.enum(STREAM_ENTITY_TYPES),
  entityId: z.uuid(),
});

export const ACTIVE_STREAMS_MAX = 100;
