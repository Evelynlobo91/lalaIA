import { describe, expect, it, vi } from "vitest";
import { PublicApiExplorerActivity, type ExplorerActivityApis } from "./public-api-explorer-activity";

const ANA = "11111111-1111-4111-8111-111111111111";

function apis(patch: Partial<ExplorerActivityApis> = {}): ExplorerActivityApis {
  return {
    missionExplorationOf: vi.fn().mockResolvedValue({ completedMissions: 1, checkIns: 2, visitedPlaceIds: ["p2", "p3"] }),
    favoriteKeysOf: vi.fn().mockResolvedValue([
      { entityType: "place", entityId: "p1" },
      { entityType: "place", entityId: "p2" },
      { entityType: "event", entityId: "e1" },
    ]),
    placeFacets: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, category: "cafes", neighborhood: "Centro" }))),
    eventSummaries: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, category: "shows", neighborhood: null }))),
    ...patch,
  };
}

describe("PublicApiExplorerActivity", () => {
  it("junta missões e favoritos pelas APIs públicas; lugares favoritados e visitados contam uma vez", async () => {
    const a = apis();
    const activity = await new PublicApiExplorerActivity(a).activityOf(ANA);
    expect(a.favoriteKeysOf).toHaveBeenCalledWith({ id: ANA });
    expect(a.placeFacets).toHaveBeenCalledWith(["p1", "p2", "p3"]);
    expect(a.eventSummaries).toHaveBeenCalledWith(["e1"]);
    expect(activity).toMatchObject({
      completedMissions: 1,
      checkIns: 2,
      favoritePlaceIds: ["p1", "p2"],
      favoriteEventIds: ["e1"],
      visitedPlaceIds: ["p2", "p3"],
      events: [{ id: "e1", category: "shows", neighborhood: null }],
    });
    expect(activity.places).toHaveLength(3);
  });

  it("sem nada descoberto, não consulta lugares nem eventos", async () => {
    const a = apis({
      missionExplorationOf: vi.fn().mockResolvedValue({ completedMissions: 0, checkIns: 0, visitedPlaceIds: [] }),
      favoriteKeysOf: vi.fn().mockResolvedValue([]),
    });
    const activity = await new PublicApiExplorerActivity(a).activityOf(ANA);
    expect(a.placeFacets).not.toHaveBeenCalled();
    expect(a.eventSummaries).not.toHaveBeenCalled();
    expect(activity.places).toEqual([]);
  });
});
