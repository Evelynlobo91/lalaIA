import { describe, expect, it } from "vitest";
import { AvoidsUsual, FitsBudget, FitsTimeWindow, MatchesExperience, WithinDistance, applyFilters, defaultFilters } from "./filters";
import { at, candidate, constraints } from "./test-fixtures";

const window = (start: number, end: number) => ({ known: true as const, window: { start: at(start), end: at(end) } });

describe("FitsTimeWindow (tempo disponível)", () => {
  const f = new FitsTimeWindow();

  it("acontecendo com tempo de sobra entra", () => {
    expect(f.keep(candidate({ availability: window(-30, 120) }), constraints())).toBe(true);
  });

  it("fechando/terminando em 10 min fica de fora (não vale a ida)", () => {
    expect(f.keep(candidate({ availability: window(-60, 10) }), constraints())).toBe(false);
  });

  it("começa depois do tempo disponível → fora; começa com 30 min de folga → entra", () => {
    expect(f.keep(candidate({ availability: window(130, 200) }), constraints({ availableMinutes: 120 }))).toBe(false);
    expect(f.keep(candidate({ availability: window(110, 200) }), constraints({ availableMinutes: 120 }))).toBe(false);
    expect(f.keep(candidate({ availability: window(90, 200) }), constraints({ availableMinutes: 120 }))).toBe(true);
  });

  it("com pouco tempo disponível, basta caber nesse tempo", () => {
    expect(f.keep(candidate({ availability: window(-10, 20) }), constraints({ availableMinutes: 20 }))).toBe(true);
  });

  it("fechado no período → fora", () => {
    expect(f.keep(candidate({ availability: { known: true, window: null } }), constraints())).toBe(false);
  });

  it("horário desconhecido: só ao ar livre entra", () => {
    const unknown = { known: false as const };
    expect(f.keep(candidate({ kind: "place", category: "ar-livre", availability: unknown }), constraints())).toBe(true);
    expect(f.keep(candidate({ kind: "place", category: "bares", availability: unknown }), constraints())).toBe(false);
  });
});

describe("FitsBudget (orçamento do grupo)", () => {
  const f = new FitsBudget();

  it("sem orçamento, tudo entra", () => {
    expect(f.keep(candidate({ priceCents: 50_000 }), constraints({ budgetCents: null }))).toBe(true);
  });

  it("preço por pessoa × pessoas precisa caber no total", () => {
    expect(f.keep(candidate({ priceCents: 3_500 }), constraints({ budgetCents: 7_000, people: 2 }))).toBe(true);
    expect(f.keep(candidate({ priceCents: 3_600 }), constraints({ budgetCents: 7_000, people: 2 }))).toBe(false);
  });

  it("grátis cabe em 'só grátis'", () => {
    expect(f.keep(candidate({ priceCents: 0 }), constraints({ budgetCents: 0 }))).toBe(true);
  });

  it("sem preço: entra com orçamento; em 'só grátis' só ao ar livre", () => {
    expect(f.keep(candidate({ kind: "place", category: "restaurantes", priceCents: null }), constraints({ budgetCents: 5_000 }))).toBe(true);
    expect(f.keep(candidate({ kind: "place", category: "restaurantes", priceCents: null }), constraints({ budgetCents: 0 }))).toBe(false);
    expect(f.keep(candidate({ kind: "place", category: "ar-livre", priceCents: null }), constraints({ budgetCents: 0 }))).toBe(true);
  });
});

describe("WithinDistance", () => {
  const f = new WithinDistance();
  const origin = { lat: -26.3, lon: -48.84 };

  it("sem localização não filtra", () => {
    expect(f.keep(candidate({ distanceMeters: null }), constraints())).toBe(true);
  });

  it("com localização: até o limite entra; além ou desconhecida fica de fora", () => {
    expect(f.keep(candidate({ distanceMeters: 2_000 }), constraints({ origin, maxDistanceMeters: 2_000 }))).toBe(true);
    expect(f.keep(candidate({ distanceMeters: 2_001 }), constraints({ origin, maxDistanceMeters: 2_000 }))).toBe(false);
    expect(f.keep(candidate({ distanceMeters: null }), constraints({ origin }))).toBe(false);
  });
});

describe("MatchesExperience e AvoidsUsual", () => {
  it("tipo escolhido: só as categorias dele; missão (sem categoria) fica de fora", () => {
    const f = new MatchesExperience();
    expect(f.keep(candidate({ category: "shows" }), constraints({ categories: ["shows", "festas"] }))).toBe(true);
    expect(f.keep(candidate({ category: "bares" }), constraints({ categories: ["shows"] }))).toBe(false);
    expect(f.keep(candidate({ kind: "mission", category: null }), constraints({ categories: ["shows"] }))).toBe(false);
    expect(f.keep(candidate({ kind: "mission", category: null }), constraints())).toBe(true);
  });

  it("algo diferente: evita as categorias de sempre", () => {
    const f = new AvoidsUsual();
    expect(f.keep(candidate({ category: "shows" }), constraints({ avoidCategories: ["shows"] }))).toBe(false);
    expect(f.keep(candidate({ category: "teatro" }), constraints({ avoidCategories: ["shows"] }))).toBe(true);
  });
});

describe("applyFilters", () => {
  it("combina todos (E lógico)", () => {
    const k = constraints({ budgetCents: 2_000, origin: { lat: -26.3, lon: -48.84 }, maxDistanceMeters: 1_000 });
    const items = [
      candidate({ id: "ok", priceCents: 1_000, distanceMeters: 500 }),
      candidate({ id: "caro", priceCents: 3_000, distanceMeters: 500 }),
      candidate({ id: "longe", priceCents: 1_000, distanceMeters: 5_000 }),
      candidate({ id: "acabando", priceCents: 1_000, distanceMeters: 500, availability: window(-100, 5) }),
    ];
    expect(applyFilters(items, defaultFilters, k).map((c) => c.id)).toEqual(["ok"]);
  });
});
