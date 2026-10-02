import type { EventListItem, EventSearchCriteria } from "@/modules/events";
import type { PlaceListItem, PlaceSearchCriteria } from "@/modules/places";
import type { DomainError, Result } from "@/shared/kernel";
import type { EventCriteria, HitPage, PageRequest, PlaceCriteria, SearchableEvents, SearchablePlaces, SearchHit } from "../domain/search";

type Page<T> = { items: T[]; nextCursor: string | null };
type SearchFn<C, T> = (criteria: C) => Promise<Result<Page<T>, DomainError>>;

export function placeHit(p: PlaceListItem): SearchHit {
  return {
    id: p.id,
    href: `/lugares/${p.id}`,
    title: p.name,
    categoryLabel: p.categoryLabel,
    where: p.neighborhood,
    when: null,
    badge: p.openNow === null ? null : p.openNow ? { label: "Aberto agora", tone: "success" } : { label: "Fechado", tone: "neutral" },
  };
}

export function eventHit(e: EventListItem): SearchHit {
  return {
    id: e.id,
    href: `/eventos/${e.id}`,
    title: e.title,
    categoryLabel: e.categoryLabel,
    where: e.neighborhood ? `${e.placeName} · ${e.neighborhood}` : e.placeName,
    when: e.whenLabel,
    badge: e.happeningNow ? { label: "Acontecendo", tone: "live" } : { label: e.priceLabel, tone: "neutral" },
  };
}

function toHits<T>(result: Result<Page<T>, DomainError>, map: (item: T) => SearchHit): Result<HitPage, DomainError> {
  return result.ok ? { ok: true, value: { items: result.value.items.map(map), nextCursor: result.value.nextCursor } } : result;
}

/** Adaptador: a busca pública do módulo places (`searchPlaces` do index.ts) vista como `SearchablePlaces`. */
export class PlacesSearchSource implements SearchablePlaces {
  constructor(private readonly searchPlaces: SearchFn<PlaceSearchCriteria, PlaceListItem>) {}

  async search(criteria: PlaceCriteria, page: PageRequest) {
    return toHits(await this.searchPlaces({ ...criteria, ...page }), placeHit);
  }
}

/** Adaptador: a busca pública do módulo events (`searchEvents` do index.ts) vista como `SearchableEvents`. */
export class EventsSearchSource implements SearchableEvents {
  constructor(private readonly searchEvents: SearchFn<EventSearchCriteria, EventListItem>) {}

  async search(criteria: EventCriteria, page: PageRequest) {
    return toHits(await this.searchEvents({ ...criteria, ...page }), eventHit);
  }
}
