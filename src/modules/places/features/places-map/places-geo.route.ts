import { observed } from "@/shared/http/observed";
import { resultResponse } from "@/shared/http/responses";
import type { GetPlacesGeo } from "./places-geo";

/** GET /api/places/geo — cacheável: lugares mudam pouco (importação/edição de parceiro). */
export function placesGeoRoute(getPlacesGeo: () => GetPlacesGeo) {
  return observed(async () => {
    const response = resultResponse(await getPlacesGeo().execute());
    if (response.ok) response.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return response;
  });
}
