import { describe, expect, it, vi } from "vitest";
import type { CandidateQuery } from "../domain/constraints";
import { NOW, at } from "../domain/test-fixtures";
import { EventCandidateSource } from "./event-candidate-source";
import { MissionCandidateSource } from "./mission-candidate-source";
import { PLACE_CANDIDATE_LIMIT, PlaceCandidateSource } from "./place-candidate-source";

const origin = { lat: -26.3, lon: -48.84 };
const query = (overrides: Partial<CandidateQuery> = {}): CandidateQuery => ({ now: NOW, horizon: at(120), origin: null, radiusMeters: 5_000, categories: null, ...overrides });

describe("PlaceCandidateSource", () => {
  it("busca no raio/categorias e calcula quando está aberto com a regra de horário de places", async () => {
    const places = {
      candidates: vi.fn().mockResolvedValue([
        { id: "p1", name: "Café Aberto", category: "cafes", neighborhood: "Centro", openingHours: "x", distanceMeters: 149.6, newSince: null },
        { id: "p2", name: "Parque", category: "ar-livre", neighborhood: null, openingHours: null, distanceMeters: null, newSince: at(-60) },
      ]),
      isOpenAt: vi.fn((hours: string | null, when: Date) => (hours === null ? null : when < at(45))),
    };
    const items = await new PlaceCandidateSource(places).find(query({ origin, categories: ["cafes", "ar-livre"] }));

    expect(places.candidates).toHaveBeenCalledWith({ origin, radiusMeters: 5_000, categories: ["cafes", "ar-livre"], limit: PLACE_CANDIDATE_LIMIT });
    expect(items[0]).toMatchObject({ kind: "place", href: "/lugares/p1", categoryLabel: "Cafés e docerias", priceCents: null, distanceMeters: 150 });
    expect(items[0]!.availability).toEqual({ known: true, window: { start: NOW, end: at(40) } });
    expect(items[1]).toMatchObject({ availability: { known: false }, newSince: at(-60) });
  });
});

describe("EventCandidateSource", () => {
  const event = (id: string, category: "shows" | "feiras", placeId: string) => ({
    id,
    title: id,
    category,
    placeId,
    placeName: "Lugar",
    neighborhood: null,
    startsAt: at(-10),
    endsAt: at(60),
    priceCents: 2_000,
    publishedAt: at(-600),
  });

  it("pede os eventos do período, filtra a categoria e busca a distância numa consulta", async () => {
    const events = {
      candidates: vi.fn().mockResolvedValue([event("a", "shows", "l1"), event("b", "feiras", "l2"), event("c", "shows", "l1")]),
      distances: vi.fn().mockResolvedValue(new Map([["l1", 800]])),
    };
    const items = await new EventCandidateSource(events).find(query({ origin, categories: ["shows"] }));

    expect(events.candidates).toHaveBeenCalledWith({ from: NOW, to: at(120), limit: 60 });
    expect(events.distances).toHaveBeenCalledWith(origin, ["l1"]);
    expect(items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(items[0]).toMatchObject({ kind: "event", href: "/eventos/a", priceCents: 2_000, distanceMeters: 800, newSince: at(-600) });
    expect(items[0]!.availability).toEqual({ known: true, window: { start: at(-10), end: at(60) } });
  });

  it("sem localização não consulta distância", async () => {
    const events = { candidates: vi.fn().mockResolvedValue([event("a", "shows", "l1")]), distances: vi.fn() };
    const [item] = await new EventCandidateSource(events).find(query());
    expect(events.distances).not.toHaveBeenCalled();
    expect(item!.distanceMeters).toBeNull();
  });
});

describe("MissionCandidateSource", () => {
  const mission = {
    id: "m1",
    title: "Rota do Café",
    description: "",
    xp: 100,
    startsAt: at(-60 * 24),
    endsAt: at(60 * 24),
    stepCount: 2,
    places: [
      { id: "l1", name: "Café Longe", neighborhood: "América" },
      { id: "l2", name: "Café Perto", neighborhood: "Centro" },
    ],
  };

  it("usa o lugar de etapa mais perto como distância; tempo e gasto viram duração e preço (#64)", async () => {
    const missions = {
      available: vi.fn().mockResolvedValue([{ ...mission, estimatedMinutes: 90, costCents: 0, surprise: false }]),
      distances: vi.fn().mockResolvedValue(new Map([["l1", 3_000], ["l2", 400]])),
      facets: vi.fn().mockResolvedValue([]),
    };
    const [item] = await new MissionCandidateSource(missions).find(query({ origin }));
    expect(item).toMatchObject({ kind: "mission", href: "/missoes/m1", category: null, xp: 100, distanceMeters: 400, placeName: "Café Perto", priceCents: 0, durationMinutes: 90 });
  });

  it("categoria derivada dos lugares das etapas (a mais comum; empate fica com a primeira), numa consulta só", async () => {
    const tres = { ...mission, id: "m2", places: [...mission.places, { id: "l3", name: "Bar", neighborhood: null }] };
    const missions = {
      available: vi.fn().mockResolvedValue([mission, tres]),
      distances: vi.fn(),
      facets: vi.fn().mockResolvedValue([
        { id: "l1", category: "bares" },
        { id: "l2", category: "cafes" },
        { id: "l3", category: "cafes" },
      ]),
    };
    const items = await new MissionCandidateSource(missions).find(query());
    expect(missions.facets).toHaveBeenCalledWith(["l1", "l2", "l3"]);
    expect(items.map((i) => [i.id, i.category, i.categoryLabel])).toEqual([
      ["m1", "bares", "Bares"],
      ["m2", "cafes", "Cafés e docerias"],
    ]);
    expect(missions.distances).not.toHaveBeenCalled();
  });

  it("com tipo de experiência escolhido, só entram as missões daquela categoria", async () => {
    const missions = { available: vi.fn().mockResolvedValue([mission]), distances: vi.fn(), facets: vi.fn().mockResolvedValue([{ id: "l1", category: "cafes" }]) };
    expect(await new MissionCandidateSource(missions).find(query({ categories: ["shows"] }))).toEqual([]);
    expect((await new MissionCandidateSource(missions).find(query({ categories: ["cafes"] }))).map((i) => i.id)).toEqual(["m1"]);
  });
});
