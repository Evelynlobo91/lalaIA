import { MAX_STOPS, travelLabel, type ItineraryPlanner, type PlanInput, type PlannedStop } from "../domain/itinerary";

/** Tempo médio por parada (min), para caber no tempo disponível. */
const STAY_MINUTES = 60;
const MAX_LOCAL_STOPS = Math.min(3, MAX_STOPS);

/**
 * Fallback (camada 1): monta o roteiro sem LLM, só com os melhores candidatos do motor.
 * Pega na ordem do ranking o que cabe no tempo e no orçamento e ordena pelo horário de início.
 */
export class LocalItineraryPlanner implements ItineraryPlanner {
  readonly name = "motor" as const;

  async plan(input: PlanInput): Promise<PlannedStop[]> {
    const now = Date.parse(input.now);
    const end = now + input.availableMinutes * 60_000;
    const slots = Math.max(1, Math.min(MAX_LOCAL_STOPS, Math.floor(input.availableMinutes / STAY_MINUTES)));
    let budget = input.budgetCents;
    const picked: Array<{ stop: PlannedStop; start: number }> = [];

    for (const c of input.candidates) {
      if (picked.length >= slots) break;
      const start = c.availableFrom ? Math.max(now, Date.parse(c.availableFrom)) : now;
      if (start >= end) continue;
      const cost = c.priceCents === null ? null : c.priceCents * input.people;
      if (budget !== null && cost !== null && cost > budget) continue;
      if (budget !== null && cost !== null) budget -= cost;
      picked.push({
        start,
        stop: { key: c.key, travel: travelLabel(c.distanceMeters), why: c.reasons[0] ?? "Boa opção para agora", estimatedCostCents: cost },
      });
    }
    return picked.sort((a, b) => a.start - b.start).map((p) => p.stop);
  }
}
