// Fábricas de dados para os testes do módulo (não usadas em produção).
import type { Candidate } from "./candidate";
import type { SearchConstraints } from "./constraints";

export const NOW = new Date("2026-10-10T20:00:00Z");
export const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

export function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    kind: "event",
    id: "e1",
    title: "Show no Centro",
    category: "shows",
    categoryLabel: "Shows e música",
    placeName: "Teatro",
    neighborhood: "Centro",
    href: "/eventos/e1",
    priceCents: 0,
    availability: { known: true, window: { start: at(-30), end: at(120) } },
    distanceMeters: null,
    newSince: null,
    xp: null,
    ...overrides,
  };
}

export function constraints(overrides: Partial<SearchConstraints> = {}): SearchConstraints {
  return {
    now: NOW,
    availableMinutes: 120,
    budgetCents: null,
    people: 1,
    origin: null,
    maxDistanceMeters: 10_000,
    categories: null,
    avoidCategories: [],
    ...overrides,
  };
}
