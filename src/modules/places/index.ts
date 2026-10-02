// API pública do módulo places ("Onde ir").
// A importação do OpenStreetMap roda pela linha de comando (npm run places:seed / places:import).
import { cache } from "react";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import { listPlacesRoute } from "./features/list-places/list-places.route";
import { DEFAULT_PAGE_SIZE } from "./features/list-places/list-places.schema";
import { ListPlaces } from "./features/list-places/list-places.use-case";
import { PostgresPlaceReader } from "./infra/postgres-place-reader";
import { GetPlaceDetail } from "./features/place-detail/place-detail.use-case";
import { GetPlacesGeo } from "./features/places-map/places-geo";
import { placesGeoRoute } from "./features/places-map/places-geo.route";
import type { SelectedPlace } from "./features/places-map/ui/places-layer";
import { FindNearbyPlaces } from "./features/nearby-places/nearby-places.use-case";
import { nearbyPlacesRoute } from "./features/nearby-places/nearby-places.route";
import { nearbyPlacesSchema } from "./features/nearby-places/nearby-places.schema";
import type { ModuleSubscriptions } from "@/shared/events";
import { AssignPlaceOwner, placeForEdit, type Editor } from "./features/edit-place/edit-place";
import { PostgresPlaceOwnershipRepository } from "./infra/postgres-place-ownership-repository";
import { scheduleFromOsm } from "./domain/weekly-schedule";
import type { Coordinates } from "./domain/place";
import { searchPlacesRoute } from "./features/search-by-name/search-by-name.route";
import { SearchPlaces, type PlaceSearchCriteria } from "./features/search-places/search-places";
import { PostgresPlaceSearch } from "./infra/postgres-place-search";
import { GetPlaceFacets } from "./features/place-facets/place-facets";
import { PostgresPlaceFacets } from "./infra/postgres-place-facets";
import { FindPlaceCandidates, type PlaceCandidate, type PlaceCandidatesQuery } from "./features/place-candidates/place-candidates";

export type { PlaceDraft, Address, Coordinates } from "./domain/place";
export type { PlaceListItem, PlaceListPage } from "./features/list-places/list-places.use-case";
export { PlaceList } from "./features/list-places/ui/place-list";
export { PlaceListSkeleton } from "./features/list-places/ui/place-list-card";
export { isOpenAt } from "./domain/opening-hours";
export type { PlaceDetailView } from "./features/place-detail/place-detail.use-case";
export { PlaceDetailCard } from "./features/place-detail/ui/place-detail-view";
export { PlacesMap } from "./features/places-map/ui/places-map";
export type { SelectedPlace } from "./features/places-map/ui/places-layer";
export { NearMeButton } from "./features/nearby-places/ui/near-me-button";
export { PlaceListCard } from "./features/list-places/ui/place-list-card";
export type { NearbyPlacesResult, NearbyPlaceItem } from "./features/nearby-places/nearby-places.use-case";
export { RADIUS_OPTIONS_M, DEFAULT_RADIUS_M, servicePointShape } from "./features/nearby-places/nearby-places.schema";
export { formatDistance } from "./features/nearby-places/nearby-places.use-case";
export { EditPlaceForm } from "./features/edit-place/ui/edit-place-form";
export { PlacePicker, type PickedPlace } from "./features/search-by-name/ui/place-picker";
export type { PlaceSummary } from "./domain/place-ownership";
export type { PlaceCandidate, PlaceCandidatesQuery } from "./features/place-candidates/place-candidates";

const reader = lazy(() => new PostgresPlaceReader(sql()));
const listPlaces = lazy(() => new ListPlaces(reader()));
const placeDetail = lazy(() => new GetPlaceDetail(reader()));
const placesGeo = lazy(() => new GetPlacesGeo(reader()));
const findNearby = lazy(() => new FindNearbyPlaces(reader()));

/**
 * Lugares perto de um ponto vindo da URL (/lugares/perto?lat=&lon=&radius=).
 * Devolve o motivo quando os parâmetros são inválidos ou estão fora de Joinville.
 */
export async function nearbyPlaces(params: Record<string, string | string[] | undefined>) {
  const parsed = nearbyPlacesSchema.safeParse({ lat: params.lat, lon: params.lon, radius: params.radius ?? undefined });
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Localização inválida." };
  const result = await findNearby().execute(parsed.data);
  if (!result.ok) throw result.error;
  return { ok: true as const, value: result.value };
}

/** Detalhe de um lugar ou `null` (id inválido ou inexistente). Memoizado por requisição: página e metadados fazem uma consulta só. */
export const getPlaceDetail = cache(async (id: string) => {
  const result = await placeDetail().execute(id);
  return result.ok ? result.value : null;
});

/** Lugar para abrir o mapa já centralizado (/mapa?lugar=<id>); `null` se não existir. */
export async function mapFocus(id: string | undefined): Promise<SelectedPlace | null> {
  if (!id) return null;
  const place = await getPlaceDetail(id);
  if (!place) return null;
  return { id: place.id, name: place.name, category: place.category, categoryLabel: place.categoryLabel, lat: place.location.lat, lon: place.location.lon };
}

/** Primeira página da lista de lugares (para renderizar no servidor). */
export async function firstPlacesPage() {
  const result = await listPlaces().execute({ cursor: null, limit: DEFAULT_PAGE_SIZE });
  if (!result.ok) throw result.error;
  return result.value;
}

export const placesApi = {
  /** GET /api/places */
  list: listPlacesRoute(listPlaces),
  /** GET /api/places/geo */
  geo: placesGeoRoute(placesGeo),
  /** GET /api/places/nearby */
  nearby: nearbyPlacesRoute(findNearby),
  /** GET /api/places/search?q= */
  search: searchPlacesRoute(() => ownership()),
};

const ownership = lazy(() => new PostgresPlaceOwnershipRepository(sql()));

/** Busca por nome (sem acento), com a informação de se o lugar já tem responsável. */
export function searchPlacesByName(query: string, limit = 10) {
  const q = query.trim();
  return q.length < 2 ? Promise.resolve([]) : ownership().searchByName(q.slice(0, 80), limit);
}

/** Resumo de um lugar (ou null se não existir). */
export function placeSummary(id: string) {
  return ownership().summary(id);
}

/** Distância (m) de um ponto até cada lugar, numa consulta (ex.: eventos acontecendo agora perto de mim). */
export function placeDistances(origin: Coordinates, ids: string[]): Promise<Map<string, number>> {
  return reader().distancesFrom(origin, ids);
}

const findPlaceCandidates = lazy(() => new FindPlaceCandidates(reader()));

/**
 * Lugares que podem virar sugestão (Recomendação): no raio de uma origem (do mais perto) ou, sem origem,
 * os mais recentes; filtrados por categoria. Uma consulta (PostGIS). A origem não é gravada.
 */
export function placeCandidates(query: PlaceCandidatesQuery): Promise<PlaceCandidate[]> {
  return findPlaceCandidates().execute(query);
}

/** Coordenadas de vários lugares numa consulta (ex.: camada Live do mapa). Ids inválidos ou inexistentes ficam de fora. */
export function placePoints(ids: string[]): Promise<Array<{ id: string; name: string; lat: number; lon: number }>> {
  return reader().pointsByIds(ids);
}

/** Resumos de vários lugares numa consulta (ex.: listas de eventos). */
export function placeSummaries(ids: string[]) {
  return ownership().summaries([...new Set(ids)]);
}

/** Lugares sob responsabilidade do usuário (portal do parceiro). */
export function placesManagedBy(userId: string) {
  return ownership().managedBy(userId);
}

/** Dados para o formulário de edição; null se o usuário não for o dono (nem admin). */
export async function editablePlace(editor: Editor, placeId: string) {
  const place = await placeForEdit(ownership(), editor, placeId);
  return place ? { place, ...scheduleFromOsm(place.openingHours) } : null;
}

/**
 * Reações a eventos de outros módulos (registradas no boot, em src/bootstrap).
 * Vínculo aprovado no módulo partners → este lugar passa a ter um responsável.
 */
export const subscriptions: ModuleSubscriptions = (bus) => {
  bus.subscribe("partners.PlaceClaimApproved", (event) => new AssignPlaceOwner(ownership()).execute(event.payload.placeId, event.payload.userId));
};

// Busca (RF04/RF05), consumida pelo módulo discovery.
export type { PlaceSearchCriteria } from "./features/search-places/search-places";
export type { Neighborhood } from "./features/search-places/neighborhoods";
const placeSearchAdapter = lazy(() => new PostgresPlaceSearch(sql()));
const placeSearch = lazy(() => new SearchPlaces(placeSearchAdapter()));

/** Busca de lugares por texto e filtros, em ordem alfabética e paginada por cursor opaco. */
export function searchPlaces(criteria: PlaceSearchCriteria) {
  return placeSearch().execute(criteria);
}

/** Bairros com lugares (opções do filtro de localização). */
export function placeNeighborhoods() {
  return placeSearchAdapter().neighborhoods();
}

export type { PlaceFacet } from "./features/place-facets/place-facets";
const placeFacetsUseCase = lazy(() => new GetPlaceFacets(new PostgresPlaceFacets(sql())));

/** Categoria e bairro de vários lugares numa consulta (ex.: categorias e bairros explorados no progression). */
export function placeFacets(ids: string[]) {
  return placeFacetsUseCase().execute(ids);
}

/** Ids dos lugares de um bairro (ex.: eventos de um bairro, sem join entre schemas). */
export function placeIdsInNeighborhood(neighborhood: string) {
  return placeSearchAdapter().placeIdsIn(neighborhood);
}
