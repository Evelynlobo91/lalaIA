import { queryRoute } from "@/shared/http/json-route";
import { nearbyPlacesSchema } from "./nearby-places.schema";
import type { FindNearbyPlaces } from "./nearby-places.use-case";

/** GET /api/places/nearby?lat=&lon=&radius=2000 — a localização não é gravada nem registrada em log. */
export function nearbyPlacesRoute(findNearby: () => FindNearbyPlaces) {
  return queryRoute(nearbyPlacesSchema, (input) => findNearby().execute(input));
}
