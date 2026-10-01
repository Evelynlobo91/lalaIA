import { describe, expect, it, vi } from "vitest";
import type { ExplorerActivity } from "../../domain/explorer-activity";
import { GetExplorerProfile, explorerProfileFrom } from "./explorer-profile.use-case";

const ANA = "11111111-1111-4111-8111-111111111111";

const empty: ExplorerActivity = { completedMissions: 0, checkIns: 0, visitedPlaceIds: [], favoritePlaceIds: [], favoriteEventIds: [], places: [], events: [] };

const activity: ExplorerActivity = {
  completedMissions: 2,
  checkIns: 5,
  visitedPlaceIds: ["p2", "p3"],
  favoritePlaceIds: ["p1", "p2"],
  favoriteEventIds: ["e1", "e2"],
  places: [
    { id: "p1", category: "cafes", neighborhood: "Centro" },
    { id: "p2", category: "cafes", neighborhood: "América" },
    { id: "p3", category: "ar-livre", neighborhood: null },
  ],
  events: [
    { id: "e1", category: "shows", neighborhood: "Centro" },
    { id: "e2", category: "ar-livre", neighborhood: " Glória " },
  ],
};

describe("explorerProfileFrom", () => {
  it("conta lugares descobertos (favoritados ∪ visitados), eventos, missões e check-ins", () => {
    expect(explorerProfileFrom(activity)).toMatchObject({ placesDiscovered: 3, placesVisited: 2, placesFavorited: 2, eventsFavorited: 2, missionsCompleted: 2, checkIns: 5 });
  });

  it("categorias da mais explorada para a menos (empate: ordem do catálogo), com o rótulo", () => {
    expect(explorerProfileFrom(activity).categories).toEqual([
      { id: "cafes", label: "Cafés e docerias", count: 2 },
      { id: "ar-livre", label: "Parques e ar livre", count: 2 },
      { id: "shows", label: "Shows e música", count: 1 },
    ]);
  });

  it("bairros sem repetição, sem vazios, em ordem alfabética", () => {
    expect(explorerProfileFrom(activity).neighborhoods).toEqual(["América", "Centro", "Glória"]);
  });

  it("sem atividade: tudo zerado", () => {
    expect(explorerProfileFrom(empty)).toEqual({ placesDiscovered: 0, placesVisited: 0, placesFavorited: 0, eventsFavorited: 0, missionsCompleted: 0, checkIns: 0, categories: [], neighborhoods: [] });
  });
});

describe("GetExplorerProfile", () => {
  it("lê a atividade do próprio usuário", async () => {
    const source = { activityOf: vi.fn().mockResolvedValue(activity) };
    const profile = await new GetExplorerProfile(source).execute(ANA);
    expect(source.activityOf).toHaveBeenCalledWith(ANA);
    expect(profile.placesDiscovered).toBe(3);
  });

  it("id inválido é recusado sem consultar os módulos", async () => {
    const source = { activityOf: vi.fn() };
    await expect(new GetExplorerProfile(source).execute("x")).rejects.toThrow();
    expect(source.activityOf).not.toHaveBeenCalled();
  });
});
