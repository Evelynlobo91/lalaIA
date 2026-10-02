import type { CandidateKind } from "./candidate";

/** Candidato como o planejador o vê: só dados, já filtrados e ranqueados pelo motor (camada 1). */
export type PlannerCandidate = {
  key: string;
  kind: CandidateKind;
  title: string;
  categoryLabel: string | null;
  placeName: string | null;
  neighborhood: string | null;
  distanceMeters: number | null;
  /** Por pessoa, em centavos; `null` = sem preço informado. */
  priceCents: number | null;
  /** Período em que dá para aproveitar (ISO); `null` = horário não informado. */
  availableFrom: string | null;
  availableUntil: string | null;
  reasons: string[];
};

export type PlanInput = {
  now: string;
  availableMinutes: number;
  /** Total do grupo, em centavos; `null` = sem limite. */
  budgetCents: number | null;
  people: number;
  hasOrigin: boolean;
  candidates: PlannerCandidate[];
};

/** Uma parada do roteiro, na ordem de visita. */
export type PlannedStop = {
  key: string;
  /** "Uns 10 min a pé", "Uns 12 min de carro ou app". */
  travel: string;
  /** Por que esta parada, para a pessoa. */
  why: string;
  /** Custo estimado do grupo nesta parada, em centavos; `null` = não dá para estimar. */
  estimatedCostCents: number | null;
};

export type PlannerName = "claude" | "motor";

/** Porta (DIP): quem monta o roteiro. LLM ou regra local; trocar um pelo outro não muda o caso de uso. */
export interface ItineraryPlanner {
  readonly name: PlannerName;
  plan(input: PlanInput): Promise<PlannedStop[]>;
}

export const MAX_STOPS = 4;

const clip = (text: string, max: number) => text.trim().replace(/\s+/g, " ").slice(0, max);

/**
 * Confere o roteiro antes de mostrar (o LLM não é confiável):
 * - de 1 a 4 paradas, sem repetir;
 * - toda parada precisa ser um dos candidatos (descarta alucinação);
 * - custo de item com preço conhecido = preço × pessoas (não aceita o valor inventado);
 * - a soma cabe no orçamento.
 * Devolve as paradas normalizadas ou o motivo da recusa.
 */
export function validateItinerary(stops: PlannedStop[], input: PlanInput): { ok: true; stops: PlannedStop[] } | { ok: false; problem: string } {
  if (stops.length === 0 || stops.length > MAX_STOPS) return { ok: false, problem: `quantidade de paradas inválida (${stops.length})` };
  const byKey = new Map(input.candidates.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const normalized: PlannedStop[] = [];
  for (const stop of stops) {
    const candidate = byKey.get(stop.key);
    if (!candidate) return { ok: false, problem: `parada fora dos candidatos (${stop.key})` };
    if (seen.has(stop.key)) return { ok: false, problem: `parada repetida (${stop.key})` };
    seen.add(stop.key);
    const estimated =
      candidate.priceCents !== null
        ? candidate.priceCents * input.people
        : stop.estimatedCostCents !== null && Number.isFinite(stop.estimatedCostCents)
          ? Math.max(0, Math.round(stop.estimatedCostCents))
          : null;
    normalized.push({ key: stop.key, travel: clip(stop.travel, 120), why: clip(stop.why, 240), estimatedCostCents: estimated });
  }
  const total = normalized.reduce((sum, s) => sum + (s.estimatedCostCents ?? 0), 0);
  if (input.budgetCents !== null && total > input.budgetCents) return { ok: false, problem: `custo acima do orçamento (${total} > ${input.budgetCents})` };
  return { ok: true, stops: normalized };
}

/** "Uns 10 min a pé" / "Uns 12 min de carro ou app" a partir da distância (aproximada) até a parada. */
export function travelLabel(distanceMeters: number | null): string {
  if (distanceMeters === null) return "Veja a rota em \"Como chegar\"";
  if (distanceMeters <= 1500) return `Uns ${Math.max(1, Math.round(distanceMeters / 80))} min a pé`;
  return `Uns ${Math.max(5, Math.round(distanceMeters / 400) + 5)} min de carro ou app`;
}
