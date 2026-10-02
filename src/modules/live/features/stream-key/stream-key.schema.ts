import { z } from "zod";
import { STREAM_ENTITY_TYPES } from "../../domain/stream";

/** Gerar a chave de um lugar ou evento do parceiro. */
export const provisionStreamSchema = z.object({
  entityType: z.enum(STREAM_ENTITY_TYPES),
  entityId: z.uuid(),
});

/** Ações sobre uma transmissão existente (rotacionar, revelar). */
export const streamIdSchema = z.object({ streamId: z.uuid() });
