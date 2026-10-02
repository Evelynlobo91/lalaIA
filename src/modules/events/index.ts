// API pública do módulo events ("O que fazer").
import { toLocalInput } from "@/shared/time/joinville-time";
import { queryRoute } from "@/shared/http/json-route";
import { cache } from "react";
import { eventRepository, getEventDetail as eventDetailUseCase, listEvents, placesLookup } from "./composition";
import { DEFAULT_PAGE_SIZE, listEventsSchema } from "./features/list-events/list-events";
import type { EventRecord } from "./domain/event";

export { EventForm, type EventFormValues } from "./features/manage-events/ui/event-form";
export { CancelEventButton } from "./features/manage-events/ui/cancel-event-button";
export { EventList, EventListCard, EventListSkeleton } from "./features/list-events/ui/event-list";
export type { EventListItem, EventListPage } from "./features/list-events/list-events";
export { EventDetailCard } from "./features/event-detail/ui/event-detail-card";
export type { EventDetailView, EventPhase } from "./features/event-detail/event-detail";
export { formatPrice, type EventRecord, type EventStatus } from "./domain/event";

export type OwnerEventItem = EventRecord & { placeName: string };

/** Eventos de um organizador (portal do parceiro), com o nome do lugar. */
export async function eventsByOwner(ownerId: string): Promise<OwnerEventItem[]> {
  const events = await eventRepository().listByOwner(ownerId);
  const names = new Map<string, string>();
  for (const placeId of new Set(events.map((e) => e.placeId))) {
    names.set(placeId, (await placesLookup.summary(placeId))?.name ?? "Lugar removido");
  }
  return events.map((e) => ({ ...e, placeName: names.get(e.placeId)! }));
}

/** Evento para o formulário de edição, só para o dono (ou admin); null para os demais. */
export async function editableEvent(editor: { id: string; isAdmin: boolean }, eventId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  const event = await eventRepository().findById(eventId);
  if (!event || (event.ownerId !== editor.id && !editor.isAdmin) || event.status === "cancelled") return null;
  const place = await placesLookup.summary(event.placeId);
  return {
    event,
    place: place ? { id: place.id, name: place.name, neighborhood: place.neighborhood } : null,
    values: {
      eventId: event.id,
      title: event.title,
      description: event.description,
      category: event.category,
      startsAt: toLocalInput(event.startsAt),
      endsAt: toLocalInput(event.endsAt),
      price: event.priceCents ? (event.priceCents / 100).toFixed(2).replace(".", ",") : "",
    },
  };
}

/** Primeira página da lista pública (renderizada no servidor). */
export async function firstEventsPage() {
  const result = await listEvents().execute({ cursor: null, limit: DEFAULT_PAGE_SIZE });
  if (!result.ok) throw result.error;
  return result.value;
}

export const eventsApi = {
  /** GET /api/events?cursor= */
  list: queryRoute(listEventsSchema, (input) => listEvents().execute(input)),
};

/** Detalhe do evento ou null. Memoizado por requisição (página + metadados + imagem = uma consulta). */
export const getEventDetail = cache(async (id: string) => {
  const result = await eventDetailUseCase().execute(id);
  return result.ok ? result.value : null;
});
