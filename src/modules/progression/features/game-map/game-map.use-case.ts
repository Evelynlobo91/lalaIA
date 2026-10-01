import { GAME_STATES, stateOf, type GameMapFacts, type GameState } from "../../domain/game-map";
import type { ExplorerActivitySource } from "../../domain/explorer-activity";

export type GamePoint = { id: string; name: string; lat: number; lon: number };

/** Portas (APIs públicas de places, missions e events, injetadas na composição). */
export type GameMapSources = {
  allPlaces(): Promise<GamePoint[]>;
  /** Lugares das etapas das missões que a pessoa aceitou e ainda não concluiu. */
  activeMissionPlaces(userId: string): Promise<string[]>;
  /** Lugares das missões disponíveis (todas; as já aceitas são descontadas aqui). */
  availableMissionPlaces(): Promise<string[]>;
  /** Lugares com evento acontecendo agora. */
  happeningEventPlaces(now: Date): Promise<string[]>;
};

export type GameFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { id: string; name: string; state: GameState };
};

export type GameMapView = {
  type: "FeatureCollection";
  features: GameFeature[];
  counts: Record<GameState, number>;
};

/**
 * #69 — Mapa de exploração da pessoa: cada lugar com a sua situação (missão ativa, evento acontecendo,
 * experiência especial, conhecido ou não explorado), em GeoJSON para a camada do mapa. A Live é a camada do
 * módulo live, somada por cima na página.
 */
export class GetGameMap {
  constructor(
    private readonly sources: GameMapSources,
    private readonly activity: ExplorerActivitySource,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(userId: string): Promise<GameMapView> {
    const [places, active, available, happening, activity] = await Promise.all([
      this.sources.allPlaces(),
      this.sources.activeMissionPlaces(userId),
      this.sources.availableMissionPlaces(),
      this.sources.happeningEventPlaces(this.clock()),
      this.activity.activityOf(userId),
    ]);
    const activeSet = new Set(active);
    const facts: GameMapFacts = {
      activeMission: activeSet,
      happeningEvent: new Set(happening),
      special: new Set(available.filter((id) => !activeSet.has(id))),
      known: new Set([...activity.favoritePlaceIds, ...activity.visitedPlaceIds]),
    };
    const counts = Object.fromEntries(GAME_STATES.map((s) => [s, 0])) as Record<GameState, number>;
    const features = places.map((p): GameFeature => {
      const state = stateOf(p.id, facts);
      counts[state] += 1;
      return { type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { id: p.id, name: p.name, state } };
    });
    return { type: "FeatureCollection", features, counts };
  }
}
