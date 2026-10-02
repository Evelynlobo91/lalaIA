import { describe, expect, it, vi } from "vitest";
import { stateOf } from "../../domain/game-map";
import { gameLayersParam } from "./game-map.schema";
import { GetGameMap } from "./game-map.use-case";

const point = (id: string) => ({ id, name: `Lugar ${id}`, lat: -26.3, lon: -48.84 });
const activity = (favorites: string[], visited: string[]) => ({
  activityOf: vi.fn().mockResolvedValue({ completedMissions: 0, checkIns: 0, visitedPlaceIds: visited, favoritePlaceIds: favorites, favoriteEventIds: [], places: [], events: [] }),
});

describe("stateOf", () => {
  it("prioridade: missão ativa > evento > especial > conhecido > não explorado", () => {
    const all = new Set(["x"]);
    const none = new Set<string>();
    expect(stateOf("x", { activeMission: all, happeningEvent: all, special: all, known: all })).toBe("missao");
    expect(stateOf("x", { activeMission: none, happeningEvent: all, special: all, known: all })).toBe("evento");
    expect(stateOf("x", { activeMission: none, happeningEvent: none, special: all, known: all })).toBe("especial");
    expect(stateOf("x", { activeMission: none, happeningEvent: none, special: none, known: all })).toBe("conhecido");
    expect(stateOf("x", { activeMission: none, happeningEvent: none, special: none, known: none })).toBe("inexplorado");
  });
});

describe("GetGameMap", () => {
  it("classifica cada lugar, conta por estado e não marca como especial a missão já aceita", async () => {
    const now = new Date("2026-10-10T20:00:00Z");
    const sources = {
      allPlaces: vi.fn().mockResolvedValue(["a", "b", "c", "d", "e"].map(point)),
      activeMissionPlaces: vi.fn().mockResolvedValue(["a"]),
      availableMissionPlaces: vi.fn().mockResolvedValue(["a", "c"]),
      happeningEventPlaces: vi.fn().mockResolvedValue(["b"]),
    };
    const view = await new GetGameMap(sources, activity(["d"], ["a"]), () => now).execute("u1");

    expect(sources.activeMissionPlaces).toHaveBeenCalledWith("u1");
    expect(sources.happeningEventPlaces).toHaveBeenCalledWith(now);
    expect(Object.fromEntries(view.features.map((f) => [f.properties.id, f.properties.state]))).toEqual({
      a: "missao",
      b: "evento",
      c: "especial",
      d: "conhecido",
      e: "inexplorado",
    });
    expect(view.counts).toEqual({ missao: 1, evento: 1, especial: 1, conhecido: 1, inexplorado: 1 });
    expect(view.features[0]!.geometry.coordinates).toEqual([-48.84, -26.3]); // GeoJSON: [lon, lat]
  });
});

describe("gameLayersParam", () => {
  it("vazio ou só inválidos = todas; senão as escolhidas, na ordem da legenda", () => {
    expect(gameLayersParam.parse(undefined)).toHaveLength(6);
    expect(gameLayersParam.parse("nada")).toHaveLength(6);
    expect(gameLayersParam.parse("live,missao,xyz")).toEqual(["missao", "live"]);
  });
});
