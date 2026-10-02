import type { FavoriteRepository } from "../../domain/favorite";
import type { FavoriteEventDirectory, FavoriteEventSummary, FavoritePlaceDirectory, FavoritePlaceSummary } from "../../domain/favorite-list";

export type EventTiming = "upcoming" | "happening" | "ended" | "cancelled";

export type MyFavoritePlace = FavoritePlaceSummary & { favoritedAt: Date };

export type MyFavoriteEvent = Omit<FavoriteEventSummary, "startsAt" | "endsAt" | "cancelled"> & { timing: EventTiming; favoritedAt: Date };

export type MyFavorites = { places: MyFavoritePlace[]; events: MyFavoriteEvent[] };

export function eventTiming(event: Pick<FavoriteEventSummary, "startsAt" | "endsAt" | "cancelled">, now: Date): EventTiming {
  if (event.cancelled) return "cancelled";
  if (event.endsAt <= now) return "ended";
  return event.startsAt <= now ? "happening" : "upcoming";
}

const stillOn = (t: EventTiming) => t === "upcoming" || t === "happening";

/**
 * RF08 — Meus favoritos, separados por tipo.
 * Lugares: do favoritado mais recente para o mais antigo.
 * Eventos: primeiro os que ainda vão acontecer (por início); depois terminados e cancelados (mais recentes primeiro).
 * Itens que não existem mais somem da lista.
 */
export class ListMyFavorites {
  constructor(
    private readonly favorites: FavoriteRepository,
    private readonly places: FavoritePlaceDirectory,
    private readonly events: FavoriteEventDirectory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string): Promise<MyFavorites> {
    const all = await this.favorites.listByUser(userId);
    const idsOf = (type: "place" | "event") => all.filter((f) => f.entityType === type).map((f) => f.entityId);
    const placeIds = idsOf("place");
    const eventIds = idsOf("event");

    const [places, events] = await Promise.all([
      placeIds.length ? this.places.summaries(placeIds) : Promise.resolve([]),
      eventIds.length ? this.events.summaries(eventIds) : Promise.resolve([]),
    ]);
    const favoritedAt = new Map(all.map((f) => [`${f.entityType}:${f.entityId}`, f.createdAt]));
    const placeById = new Map(places.map((p) => [p.id, p]));
    const now = this.now();

    const myPlaces = placeIds.flatMap((id) => {
      const place = placeById.get(id);
      return place ? [{ ...place, favoritedAt: favoritedAt.get(`place:${id}`)! }] : [];
    });

    const myEvents = events
      .map((e) => ({ event: e, timing: eventTiming(e, now) }))
      .sort((a, b) => {
        const onA = stillOn(a.timing);
        const onB = stillOn(b.timing);
        if (onA !== onB) return onA ? -1 : 1;
        return onA ? +a.event.startsAt - +b.event.startsAt : +b.event.startsAt - +a.event.startsAt;
      })
      .map(({ event: e, timing }) => ({
        id: e.id,
        title: e.title,
        categoryLabel: e.categoryLabel,
        placeName: e.placeName,
        neighborhood: e.neighborhood,
        whenLabel: e.whenLabel,
        timing,
        favoritedAt: favoritedAt.get(`event:${e.id}`)!,
      }));

    return { places: myPlaces, events: myEvents };
  }
}
