import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { Logger } from "@/shared/observability";
import { candidateKey } from "../../domain/candidate";
import { validateItinerary, type ItineraryPlanner, type PlanInput, type PlannedStop, type PlannerName } from "../../domain/itinerary";
import type { Recommendation } from "../../domain/score";
import type { TasteProfileReader } from "../../domain/taste-profile";
import { resolveConstraints, type ConstraintState } from "../rec-constraints/rec-constraints.use-case";
import type { ConstraintParams } from "../rec-constraints/rec-constraints.schema";
import type { RecommendationEngine } from "../rec-score/recommendation-engine";
import { toRecommendationItem, type RecommendationItem } from "../rec-score/recommendation-item";

/** Quantos candidatos (já ranqueados) o planejador recebe. */
export const SURPRISE_CANDIDATES = 15;

export type ItineraryStop = {
  order: number;
  item: RecommendationItem;
  travel: string;
  why: string;
  /** "R$ 40,00", "Grátis" ou "Valor no local". */
  costLabel: string;
};

export type Itinerary = {
  state: ConstraintState;
  /** Quem montou: o Claude ou o motor local (fallback). */
  source: PlannerName;
  stops: ItineraryStop[];
  totalCostLabel: string;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** Estimativa do grupo: "R$ 60,00", "Grátis" ou "Valor no local" (sem preço informado). */
const costLabel = (cents: number | null) => (cents === null ? "Valor no local" : cents === 0 ? "Grátis" : brl.format(cents / 100).replace(/ /g, " "));

/**
 * RF42 — "ME SURPREENDA": roteiro pronto com ordem, deslocamento, justificativa e custo.
 * O motor (camada 1 + score) escolhe os candidatos; o planejador (Claude) monta o roteiro só com eles.
 * Se o LLM falhar, demorar ou inventar algo fora da lista, o roteiro sai do planejador local.
 */
export class SurpriseMe {
  constructor(
    private readonly profiles: TasteProfileReader,
    private readonly engine: Pick<RecommendationEngine, "recommend">,
    private readonly planner: ItineraryPlanner | null,
    private readonly fallback: ItineraryPlanner,
    private readonly log: Pick<Logger, "warn">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { userId: string | null; params: ConstraintParams }): Promise<Result<Itinerary, DomainError>> {
    const now = this.clock();
    const profile = await this.profiles.profileOf(input.userId);
    const { state, constraints } = resolveConstraints(input.params, profile, now);
    const ranked = await this.engine.recommend(constraints, profile, SURPRISE_CANDIDATES);

    const planInput: PlanInput = {
      now: now.toISOString(),
      availableMinutes: constraints.availableMinutes,
      budgetCents: constraints.budgetCents,
      people: constraints.people,
      hasOrigin: constraints.origin !== null,
      candidates: ranked.map(toPlannerCandidate),
    };
    if (ranked.length === 0) return ok({ state, source: "motor", stops: [], totalCostLabel: costLabel(0) });

    const { source, stops } = await this.planWithFallback(planInput);
    const byKey = new Map(ranked.map((r) => [candidateKey(r.candidate), r]));
    const total = stops.reduce((sum, s) => sum + (s.estimatedCostCents ?? 0), 0);
    return ok({
      state,
      source,
      stops: stops.map((s, i) => ({
        order: i + 1,
        item: toRecommendationItem(byKey.get(s.key)!, now),
        travel: s.travel,
        why: s.why,
        costLabel: costLabel(s.estimatedCostCents),
      })),
      totalCostLabel: costLabel(total),
    });
  }

  private async planWithFallback(input: PlanInput): Promise<{ source: PlannerName; stops: PlannedStop[] }> {
    if (this.planner) {
      try {
        const checked = validateItinerary(await this.planner.plan(input), input);
        if (checked.ok) return { source: this.planner.name, stops: checked.stops };
        this.log.warn("roteiro do planejador recusado; usando o motor local", { planner: this.planner.name, problem: checked.problem });
      } catch (error) {
        this.log.warn("planejador falhou; usando o motor local", { planner: this.planner.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const checked = validateItinerary(await this.fallback.plan(input), input);
    return { source: this.fallback.name, stops: checked.ok ? checked.stops : [] };
  }
}

function toPlannerCandidate({ candidate: c, reasons }: Recommendation): PlanInput["candidates"][number] {
  const window = c.availability.known ? c.availability.window : null;
  return {
    key: candidateKey(c),
    kind: c.kind,
    title: c.title,
    categoryLabel: c.categoryLabel,
    placeName: c.placeName,
    neighborhood: c.neighborhood,
    distanceMeters: c.distanceMeters === null ? null : Math.round(c.distanceMeters),
    priceCents: c.priceCents,
    availableFrom: window ? window.start.toISOString() : null,
    availableUntil: window ? window.end.toISOString() : null,
    reasons: reasons.map((r) => r.text),
  };
}
