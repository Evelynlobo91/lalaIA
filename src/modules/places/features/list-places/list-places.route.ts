import { queryRoute } from "@/shared/http/json-route";
import { listPlacesSchema } from "./list-places.schema";
import type { ListPlaces } from "./list-places.use-case";

/** GET /api/places?cursor=...&limit=20 */
export function listPlacesRoute(listPlaces: () => ListPlaces) {
  return queryRoute(listPlacesSchema, (input) => listPlaces().execute(input));
}
