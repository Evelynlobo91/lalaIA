// Composição do módulo events (interna): usada pelas actions e pelo index.ts.
import { formatDistance, getPlaceDetail, placeDistances, placeSummaries, placeSummary } from "@/modules/places";
import { domainEvents } from "@/shared/events";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { EventPlaceLookup } from "./domain/event";
import { CancelEvent, SaveEvent } from "./features/manage-events/manage-events.use-cases";
import { PostgresEventRepository } from "./infra/postgres-event-repository";
import { PostgresEventReader } from "./infra/postgres-event-reader";
import type { EventPlaceNames } from "./domain/event-card";
import { ListEvents } from "./features/list-events/list-events";
import { GetEventDetail, type EventPlaceDetails } from "./features/event-detail/event-detail";
import { GetEventSummaries } from "./features/event-summaries/event-summaries";
import { HappeningNow, type EventPlaceDistances } from "./features/happening-now/happening-now.use-case";
import { SearchEvents } from "./features/search-events/search-events";
import { PostgresEventSearch } from "./infra/postgres-event-search";
import { FindEventCandidates } from "./features/event-candidates/event-candidates";

const placesLookup: EventPlaceLookup = { summary: placeSummary };

export const eventRepository = lazy(() => new PostgresEventRepository(sql()));
export const saveEvent = lazy(() => new SaveEvent(eventRepository(), placesLookup, domainEvents()));
export const cancelEvent = lazy(() => new CancelEvent(eventRepository(), domainEvents()));
export { placesLookup };

const placeNames: EventPlaceNames = { summaries: placeSummaries };
export const eventReader = lazy(() => new PostgresEventReader(sql()));
export const listEvents = lazy(() => new ListEvents(eventReader(), placeNames));

const placeDetails: EventPlaceDetails = {
  async detail(placeId) {
    const place = await getPlaceDetail(placeId);
    return place ? { id: place.id, name: place.name, address: place.address, directionsUrl: place.directionsUrl } : null;
  },
};
export const getEventDetail = lazy(() => new GetEventDetail(eventRepository(), placeDetails));
export const getEventSummaries = lazy(() => new GetEventSummaries(eventReader(), placeNames));

const distances: EventPlaceDistances = { distances: placeDistances, format: formatDistance };
export const happeningNow = lazy(() => new HappeningNow(eventReader(), placeNames, distances));

// Busca (RF04/RF05), consumida pelo módulo discovery.
export const searchEvents = lazy(() => new SearchEvents(new PostgresEventSearch(sql()), placeNames));
export const findEventCandidates = lazy(() => new FindEventCandidates(eventReader(), placeNames));
