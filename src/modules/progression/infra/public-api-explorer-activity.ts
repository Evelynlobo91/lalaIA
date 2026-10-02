import type { DiscoveredItem, ExplorerActivity, ExplorerActivitySource } from "../domain/explorer-activity";

/** As APIs públicas que o adaptador usa (injetadas na composição: nada de import interno de outro módulo). */
export type ExplorerActivityApis = {
  missionExplorationOf(userId: string): Promise<{ completedMissions: number; checkIns: number; visitedPlaceIds: string[] }>;
  favoriteKeysOf(user: { id: string }): Promise<Array<{ entityType: string; entityId: string }>>;
  placeFacets(ids: string[]): Promise<DiscoveredItem[]>;
  eventSummaries(ids: string[]): Promise<Array<{ id: string; category: string; neighborhood: string | null }>>;
};

/**
 * Atividade do explorador montada pelas APIs públicas de missions, favorites, places e events:
 * uma chamada por módulo, sem join entre schemas.
 */
export class PublicApiExplorerActivity implements ExplorerActivitySource {
  constructor(private readonly apis: ExplorerActivityApis) {}

  async activityOf(userId: string): Promise<ExplorerActivity> {
    const [missions, favorites] = await Promise.all([this.apis.missionExplorationOf(userId), this.apis.favoriteKeysOf({ id: userId })]);
    const favoritePlaceIds = favorites.filter((f) => f.entityType === "place").map((f) => f.entityId);
    const favoriteEventIds = favorites.filter((f) => f.entityType === "event").map((f) => f.entityId);
    const discovered = [...new Set([...favoritePlaceIds, ...missions.visitedPlaceIds])];
    const [places, events] = await Promise.all([
      discovered.length ? this.apis.placeFacets(discovered) : Promise.resolve([]),
      favoriteEventIds.length ? this.apis.eventSummaries(favoriteEventIds) : Promise.resolve([]),
    ]);
    return {
      completedMissions: missions.completedMissions,
      checkIns: missions.checkIns,
      visitedPlaceIds: missions.visitedPlaceIds,
      favoritePlaceIds,
      favoriteEventIds,
      places: places.map((p) => ({ id: p.id, category: p.category, neighborhood: p.neighborhood })),
      events: events.map((e) => ({ id: e.id, category: e.category, neighborhood: e.neighborhood })),
    };
  }
}
