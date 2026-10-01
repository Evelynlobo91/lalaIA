// Composição do módulo events (interna): usada pelas actions e pelo index.ts.
import { placeSummary } from "@/modules/places";
import { domainEvents } from "@/shared/events";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { EventPlaceLookup } from "./domain/event";
import { CancelEvent, SaveEvent } from "./features/manage-events/manage-events.use-cases";
import { PostgresEventRepository } from "./infra/postgres-event-repository";

const placesLookup: EventPlaceLookup = { summary: placeSummary };

export const eventRepository = lazy(() => new PostgresEventRepository(sql()));
export const saveEvent = lazy(() => new SaveEvent(eventRepository(), placesLookup, domainEvents()));
export const cancelEvent = lazy(() => new CancelEvent(eventRepository(), domainEvents()));
export { placesLookup };
