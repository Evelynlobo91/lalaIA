import { interactionTotals } from "@/modules/analytics";
import type { CtaInteractionCounter } from "../features/cta-metrics/cta-metrics.use-case";
import type { InteractionCounter } from "../features/stream-metrics/stream-metrics.use-case";

/** Contagens pela API pública do Analytics (uma consulta agregada por chamada, sem dados pessoais). */
export class AnalyticsInteractionCounter implements InteractionCounter, CtaInteractionCounter {
  totals(entityType: "live" | "place" | "event" | "cta", entityIds: string[], since?: Date) {
    return interactionTotals(entityType, entityIds, since);
  }
}
