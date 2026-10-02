import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/kernel";
import type { Candidate } from "../../domain/candidate";
import { FitsBudget, FitsDuration, MatchesExperience, applyFilters, defaultFilters } from "../../domain/filters";
import { Ranker } from "../../domain/score";
import { DEFAULT_WEIGHTS } from "../../domain/score-weights";
import { MissionFitSignal, defaultSignals, durationLabel } from "../../domain/signals";
import type { TasteProfile } from "../../domain/taste-profile";
import { NOW, at, candidate, constraints } from "../../domain/test-fixtures";
import { FindCandidates } from "../rec-candidates/rec-candidates.use-case";
import { RecommendWithConstraints } from "../rec-constraints/rec-constraints.use-case";
import { noConstraintParams } from "../rec-constraints/rec-constraints.schema";
import { RecommendNow } from "../rec-score/rec-score.use-case";
import { RecommendationEngine } from "../rec-score/recommendation-engine";
import { toRecommendationItem } from "../rec-score/recommendation-item";
import { FALLBACK_MISSION_REASON, RecommendMissions } from "./recommend-missions.use-case";

const mission = (id: string, overrides: Partial<Candidate> = {}): Candidate =>
  candidate({
    kind: "mission",
    id,
    title: `Missão ${id}`,
    category: null,
    categoryLabel: null,
    href: `/missoes/${id}`,
    priceCents: null,
    availability: { known: true, window: { start: at(-60 * 24), end: at(60 * 24) } },
    xp: 100,
    durationMinutes: 60,
    ...overrides,
  });

const profile = (overrides: Partial<TasteProfile> = {}): TasteProfile => ({
  categories: [],
  budgetMax: null,
  radiusKm: 5,
  groupSize: null,
  favoriteKeys: new Set(),
  ...overrides,
});

describe("filtros de tempo e orçamento para missões (#64)", () => {
  it("a missão precisa caber inteira no tempo disponível e terminar antes de deixar de valer", () => {
    const k = constraints({ availableMinutes: 90 });
    expect(new FitsDuration().keep(mission("a", { durationMinutes: 60 }), k)).toBe(true);
    expect(new FitsDuration().keep(mission("a", { durationMinutes: 120 }), k)).toBe(false);
    expect(new FitsDuration().keep(mission("a", { durationMinutes: 60, availability: { known: true, window: { start: at(-60), end: at(30) } } }), k)).toBe(false);
    // Lugares e eventos não têm duração própria: o filtro não se aplica.
    expect(new FitsDuration().keep(candidate(), constraints({ availableMinutes: 15 }))).toBe(true);
  });

  it("orçamento: gasto por pessoa × pessoas; sem gasto informado fica de fora do 'só grátis'", () => {
    expect(new FitsBudget().keep(mission("a", { priceCents: 2_000 }), constraints({ budgetCents: 5_000, people: 2 }))).toBe(true);
    expect(new FitsBudget().keep(mission("a", { priceCents: 3_000 }), constraints({ budgetCents: 5_000, people: 2 }))).toBe(false);
    expect(new FitsBudget().keep(mission("a", { priceCents: 0 }), constraints({ budgetCents: 0 }))).toBe(true);
    expect(new FitsBudget().keep(mission("a", { priceCents: null }), constraints({ budgetCents: 0 }))).toBe(false);
  });

  it("tipo de experiência vale pela categoria derivada das etapas", () => {
    expect(new MatchesExperience().keep(mission("a", { category: "cafes" }), constraints({ categories: ["cafes"] }))).toBe(true);
    expect(new MatchesExperience().keep(mission("a", { category: null }), constraints({ categories: ["cafes"] }))).toBe(false);
    expect(defaultFilters.some((f) => f instanceof FitsDuration)).toBe(true);
  });
});

describe("sinal 'cabe no seu tempo' (MissionFitSignal)", () => {
  const ctx = (availableMinutes: number) => ({ constraints: constraints({ availableMinutes }), profile: profile(), liveKeys: new Set<string>() });

  it("mais folga no tempo pesa mais; grátis soma e aparece no motivo", () => {
    const signal = new MissionFitSignal();
    const curta = signal.evaluate(mission("a", { durationMinutes: 30 }), ctx(120))!;
    const longa = signal.evaluate(mission("b", { durationMinutes: 110 }), ctx(120))!;
    expect(curta.strength).toBeGreaterThan(longa.strength);
    expect(curta.reason).toBe("Leva cerca de 30 min: cabe no seu tempo");
    expect(signal.evaluate(mission("c", { durationMinutes: 90, priceCents: 0 }), ctx(120))!.reason).toBe("Leva cerca de 1 h 30: cabe no seu tempo e é grátis");
    expect(signal.evaluate(candidate(), ctx(120))).toBeNull();
    expect(durationLabel(120)).toBe("2 h");
  });
});

describe("RecommendMissions (motor com só a fonte de missões)", () => {
  function engineWith(candidates: Candidate[], taste: TasteProfile) {
    const log = { error: vi.fn(), warn: vi.fn() };
    const engine = new RecommendationEngine(
      new FindCandidates([{ name: "missions", find: vi.fn().mockResolvedValue(candidates) }], log),
      { liveNow: vi.fn().mockResolvedValue(new Set()) },
      new Ranker(defaultSignals, DEFAULT_WEIGHTS),
      log,
    );
    const useCase = new RecommendMissions(new RecommendWithConstraints(new RecommendNow({ profileOf: vi.fn().mockResolvedValue(taste) }, engine), () => NOW));
    return useCase;
  }

  it("ordena por relevância (preferência, distância, tempo) e mostra o porquê", async () => {
    const useCase = engineWith(
      [
        mission("longe", { distanceMeters: 4_000 }),
        mission("cafe", { category: "cafes", categoryLabel: "Cafés e docerias", distanceMeters: 300 }),
        mission("perto", { distanceMeters: 200 }),
      ],
      profile({ categories: ["cafes"] }),
    );
    const res = await useCase.execute({ userId: "ana", params: { ...noConstraintParams, origin: { lat: -26.3, lon: -48.84 } } });
    if (!res.ok) throw res.error;
    expect(res.value.items.map((i) => i.id)).toEqual(["cafe", "perto", "longe"]);
    expect(res.value.items[0]!.reasons[0]).toBe("Porque você curte Cafés e docerias");
    expect(res.value.items[1]!.reasons).toContain("A 200 m de você");
  });

  it("respeita tempo disponível e orçamento", async () => {
    const useCase = engineWith(
      [mission("rapida", { durationMinutes: 45, priceCents: 0 }), mission("demorada", { durationMinutes: 180, priceCents: 0 }), mission("cara", { durationMinutes: 45, priceCents: 8_000 })],
      profile(),
    );
    const res = await useCase.execute({ userId: null, params: { ...noConstraintParams, tempo: 60, orcamento: 50, pessoas: 1 } });
    expect(res.ok && res.value.items.map((i) => i.id)).toEqual(["rapida"]);
    expect(res.ok && res.value.state).toMatchObject({ tempo: 60, orcamento: 50 });
  });

  it("toda sugestão tem um motivo (mesmo sem sinal, ex.: visitante sem localização)", async () => {
    const useCase = engineWith([mission("x", { durationMinutes: null, newSince: null })], profile());
    const res = await useCase.execute({ userId: null, params: noConstraintParams });
    expect(res.ok && res.value.items[0]!.reasons).toEqual([FALLBACK_MISSION_REASON]);
  });

  it("só devolve missões e repassa o limite", async () => {
    const execute = vi.fn().mockResolvedValue(
      ok({
        state: { tempo: 120, orcamento: null, pessoas: 1, tipo: "qualquer", origin: null },
        items: [toRecommendationItem({ candidate: candidate(), score: 1, reasons: [] }, NOW), toRecommendationItem({ candidate: mission("m"), score: 1, reasons: [] }, NOW)],
      }),
    );
    const res = await new RecommendMissions({ execute }).execute({ userId: "ana", params: noConstraintParams, limit: 3 });
    expect(execute).toHaveBeenCalledWith({ userId: "ana", params: noConstraintParams, limit: 3 });
    expect(res.ok && res.value.items.map((i) => i.kind)).toEqual(["mission"]);
  });

  it("card da missão mostra XP com o gasto e a duração", () => {
    const item = toRecommendationItem({ candidate: mission("m", { priceCents: 2_500, durationMinutes: 90 }), score: 1, reasons: [] }, NOW);
    // Intl usa espaço não separável depois de "R$".
    expect(item.priceLabel).toMatch(/^100 XP · R\$\s25,00\/pessoa$/);
    expect(item.timeLabel).toMatch(/^Cerca de 1 h 30 · até /);
    expect(applyFilters([mission("m")], defaultFilters, constraints()).length).toBe(1);
  });
});
