import type { DomainError, Result } from "@/shared/kernel";
import { queryRoute } from "@/shared/http/json-route";
import { LIVE_NOW_CACHE_CONTROL, liveNowQuerySchema } from "./live-badge.schema";

/**
 * GET público com cache curto na CDN (o mesmo para todo mundo): /api/live/active (selo nos cards) e
 * /api/live/map (camada do mapa). Não revela nada além do que as páginas mostram (sem chave nem dono).
 */
export function liveNowRoute<T>(useCase: () => { execute(): Promise<Result<T, DomainError>> }) {
  const route = queryRoute(liveNowQuerySchema, () => useCase().execute());
  return async (request: Request) => {
    const response = await route(request);
    if (response.ok) response.headers.set("cache-control", LIVE_NOW_CACHE_CONTROL);
    return response;
  };
}
