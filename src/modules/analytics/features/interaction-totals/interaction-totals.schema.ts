import { z } from "zod";
import { interactionEntityTypes } from "../../domain/interaction";

/** Quantas entidades cabem numa consulta de totais (o portal de um parceiro tem bem menos). */
export const TOTALS_MAX_IDS = 200;

/** Entrada de `interactionTotals` (chamada por outros módulos: validada mesmo assim). */
export const interactionTotalsSchema = z.object({
  entityType: z.enum(interactionEntityTypes),
  entityIds: z.array(z.uuid()).max(TOTALS_MAX_IDS),
  since: z.date().optional(),
});

export type InteractionTotalsInput = z.infer<typeof interactionTotalsSchema>;
