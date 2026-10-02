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

export type { PlaceDraft, Address, Coordinates } from "./domain/place";
export type { PlaceListItem, PlaceListPage } from "./features/list-places/list-places.use-case";
export { PlaceList } from "./features/list-places/ui/place-list";
export { PlaceListSkeleton } from "./features/list-places/ui/place-list-card";
export { isOpenAt } from "./domain/opening-hours";
export type { PlaceDetailView } from "./features/place-detail/place-detail.use-case";
export { PlaceDetailCard } from "./features/place-detail/ui/place-detail-view";

const reader = lazy(() => new PostgresPlaceReader(sql()));
const listPlaces = lazy(() => new ListPlaces(reader()));
const placeDetail = lazy(() => new GetPlaceDetail(reader()));

/** Detalhe de um lugar ou `null` (id inválido ou inexistente). Memoizado por requisição: página e metadados fazem uma consulta só. */
export const getPlaceDetail = cache(async (id: string) => {
  const result = await placeDetail().execute(id);
  return result.ok ? result.value : null;
});

/** Primeira página da lista de lugares (para renderizar no servidor). */
export async function firstPlacesPage() {
  const result = await listPlaces().execute({ cursor: null, limit: DEFAULT_PAGE_SIZE });
  if (!result.ok) throw result.error;
  return result.value;
}

export const placesApi = {
  /** GET /api/places */
  list: listPlacesRoute(listPlaces),
};
