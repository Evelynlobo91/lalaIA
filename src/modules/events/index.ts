// API pública do módulo events ("O que fazer").
import { toLocalInput } from "@/shared/time/joinville-time";
import { queryRoute } from "@/shared/http/json-route";
import { cache } from "react";
import { eventCountsReader } from "./composition";
import { eventRepository, findEventCandidates, getEventDetail as eventDetailUseCase, getEventSummaries, happeningNow, listEvents, listEventsForAdmin, placesLookup } from "./composition";
import { DEFAULT_PAGE_SIZE, listEventsSchema } from "./features/list-events/list-events";
import { eventListQuery, noEventFilters } from "./features/list-events/list-filters";
import { happeningNowSchema } from "./features/happening-now/happening-now.schema";
import type { EventRecord } from "./domain/event";
import type { EventSummary } from "./features/event-summaries/event-summaries";
import type { EventCandidate, EventCandidatesQuery } from "./features/event-candidates/event-candidates";

export type { EventSummary } from "./features/event-summaries/event-summaries";
import { searchEvents as searchEventsUseCase } from "./composition";
import type { EventSearchCriteria } from "./features/search-events/search-events";
export type { EventCandidate, EventCandidatesQuery } from "./features/event-candidates/event-candidates";
export { isHappeningAt, startsSoon, startedLabel, startsInLabel, SOON_WINDOW_MS } from "./domain/happening";

export { EventForm, type EventFormValues } from "./features/manage-events/ui/event-form";
export { CancelEventButton } from "./features/manage-events/ui/cancel-event-button";
export { EventList, EventListCard, EventListSkeleton } from "./features/list-events/ui/event-list";
export type { EventListItem, EventListPage } from "./features/list-events/list-events";
export { EventDetailCard } from "./features/event-detail/ui/event-detail-card";
export { EventDateFilter } from "./features/list-events/ui/event-date-filter";
export { EventCategoryFilter } from "./features/events-by-category/ui/event-category-filter";
export { HappeningNowSections } from "./features/happening-now/ui/happening-now-sections";
export type { HappeningNowView, HappeningItem } from "./features/happening-now/happening-now.use-case";
export type { EventListFilters } from "./features/list-events/list-filters";
export type { DateFilter } from "./domain/date-window";
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

export type { AdminEventItem } from "./features/admin-events/admin-events";

/** Backoffice (#142): todos os eventos, por título (vazio = todos). Só admin. */
export function eventsForAdmin(viewer: { isAdmin: boolean }, text: string) {
  return listEventsForAdmin().execute(viewer, text);
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

/**
 * Primeira página da lista pública a partir dos parâmetros da URL (renderizada no servidor).
 * Parâmetro inválido (ex.: data impossível) → `invalid` com a mensagem, sem quebrar a página.
 */
export async function firstEventsPage(params: Record<string, string | string[] | undefined> = {}) {
  const parsed = listEventsSchema.safeParse({ quando: single(params.quando), categoria: list(params.categoria) });
  if (!parsed.success) {
    return { invalid: parsed.error.issues[0]?.message ?? "Filtro inválido.", page: { items: [], nextCursor: null }, query: "", filters: noEventFilters };
  }
  const result = await listEvents().execute({ ...parsed.data, cursor: null, limit: DEFAULT_PAGE_SIZE });
  if (!result.ok) throw result.error;
  const filters = { quando: parsed.data.quando, categorias: parsed.data.categoria };
  // Mesmos filtros para o "Carregar mais" (API).
  return { invalid: null, page: result.value, query: eventListQuery(filters), filters };
}

/**
 * RF17/RF40 — "Agora" e "Em breve" a partir da URL (lat/lon opcionais, vindos do "Perto de mim").
 * Localização inválida ou fora de Joinville → `invalid` com a mensagem, e a tela mostra sem distância.
 */
export async function happeningNowView(params: Record<string, string | string[] | undefined> = {}) {
  const parsed = happeningNowSchema.safeParse({ lat: single(params.lat), lon: single(params.lon) });
  const result = await happeningNow().execute(parsed.success ? parsed.data : { origin: null });
  if (!result.ok) throw result.error;
  return { invalid: parsed.success ? null : (parsed.error.issues[0]?.message ?? "Localização inválida."), view: result.value };
}

const single = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
/** `categoria=a,b` ou `categoria=a&categoria=b` (formulário) viram "a,b". */
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(",") : v);

/**
 * Resumos de vários eventos por id (inclusive terminados e cancelados), numa consulta em lote.
 * Ids inexistentes ou inválidos são ignorados. Usado por outros módulos (ex.: favoritos).
 */
export function eventSummaries(ids: string[]): Promise<EventSummary[]> {
  return getEventSummaries().execute(ids);
}

/**
 * Eventos agendados que acontecem em algum momento de [from, to), com o lugar e a data de publicação.
 * Usado pela Recomendação (candidatos "acontecendo agora" e "em breve"). Duas consultas no total.
 */
export function eventCandidates(query: EventCandidatesQuery): Promise<EventCandidate[]> {
  return findEventCandidates().execute(query);
}

export const eventsApi = {
  /** GET /api/events?cursor= */
  list: queryRoute(listEventsSchema, (input) => listEvents().execute(input)),
  /** GET /api/events/agora?lat=&lon= */
  happeningNow: queryRoute(happeningNowSchema, (input) => happeningNow().execute(input)),
};

/** Detalhe do evento ou null. Memoizado por requisição (página + metadados + imagem = uma consulta). */
export const getEventDetail = cache(async (id: string) => {
  const result = await eventDetailUseCase().execute(id);
  return result.ok ? result.value : null;
});

// Busca (RF04/RF05), consumida pelo módulo discovery.
export type { EventSearchCriteria } from "./features/search-events/search-events";
export { dateFilterParam, dateWindow, dateFilterLabels, dateFilterValue, type DateWindow } from "./domain/date-window";

/** Busca de eventos por texto e filtros, por início e paginada por cursor opaco. */
export function searchEvents(criteria: EventSearchCriteria) {
  return searchEventsUseCase().execute(criteria);
}

/** Contagem de eventos publicados num período, para as métricas gerais do backoffice (#145). */
export const eventCounts = () => eventCountsReader();
