import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { EventCard, EventPlaceNames, EventReader } from "../../domain/event-card";
import { SOON_WINDOW_MS, isHappeningAt, startedLabel, startsInLabel, startsSoon } from "../../domain/happening";
import { toEventListItem, type EventListItem } from "../list-events/list-events";
import type { HappeningNowInput } from "./happening-now.schema";

type Point = { lat: number; lon: number };

/** Porta para a distância até os lugares (API pública de places, PostGIS). */
export interface EventPlaceDistances {
  distances(origin: Point, placeIds: string[]): Promise<Map<string, number>>;
  /** "80 m", "1,2 km". */
  format(meters: number): string;
}

export type HappeningItem = EventListItem & {
  /** "Começou há 25 min" / "Começa em 40 min". */
  timeLabel: string;
  distanceMeters: number | null;
  distanceLabel: string | null;
};

export type HappeningNowView = { now: HappeningItem[]; soon: HappeningItem[]; nearMe: boolean };

/** Máximo de eventos considerados nas duas seções juntas. */
export const HAPPENING_LIMIT = 60;

/**
 * RF17/RF40 — "Acontecendo agora" e "Em breve (próximas 3 h)", com o tempo desde o início
 * e, se a pessoa compartilhar a localização, a distância (cada seção ordenada pela mais perto).
 */
export class HappeningNow {
  constructor(
    private readonly reader: EventReader,
    private readonly places: EventPlaceNames,
    private readonly distances: EventPlaceDistances,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: HappeningNowInput): Promise<Result<HappeningNowView, DomainError>> {
    const now = this.clock();
    // Quem se sobrepõe a [agora, agora + 3 h) = acontecendo agora + começando em breve.
    const rows = await this.reader.listUpcoming({
      now,
      cursor: null,
      limit: HAPPENING_LIMIT,
      window: { from: now, to: new Date(now.getTime() + SOON_WINDOW_MS) },
    });
    const placeIds = [...new Set(rows.map((e) => e.placeId))];
    const [names, distances] = await Promise.all([
      this.places.summaries(placeIds),
      input.origin ? this.distances.distances(input.origin, placeIds) : Promise.resolve(new Map<string, number>()),
    ]);
    const byId = new Map(names.map((p) => [p.id, p]));

    const item = (e: EventCard, timeLabel: string): HappeningItem => {
      const meters = distances.get(e.placeId) ?? null;
      return {
        ...toEventListItem(e, byId.get(e.placeId), now),
        timeLabel,
        distanceMeters: meters,
        distanceLabel: meters === null ? null : this.distances.format(meters),
      };
    };
    // Com localização: mais perto primeiro (sem distância por último); sem ela, mantém a ordem por início.
    const order = (items: HappeningItem[]) =>
      input.origin ? [...items].sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity)) : items;

    return ok({
      now: order(rows.filter((e) => isHappeningAt(e, now)).map((e) => item(e, startedLabel(e.startsAt, now)))),
      soon: order(rows.filter((e) => startsSoon(e, now)).map((e) => item(e, startsInLabel(e.startsAt, now)))),
      nearMe: input.origin !== null,
    });
  }
}
