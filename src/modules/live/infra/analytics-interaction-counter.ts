import { interactionTotals } from "@/modules/analytics";
import type { InteractionCounter } from "../features/stream-metrics/stream-metrics.use-case";

/** Contagens pela API pública do Analytics (uma consulta agregada por chamada, sem dados pessoais). */
export class AnalyticsInteractionCounter implements InteractionCounter {
  totals(entityType: "live" | "place" | "event", entityIds: string[], since?: Date) {
    return interactionTotals(entityType, entityIds, since);
  }
}
