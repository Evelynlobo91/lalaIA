import { queryRoute } from "@/shared/http/json-route";
import { liveStatusQuerySchema } from "./stream-states.schema";
import type { GetLiveStatus } from "./stream-states.use-case";

/**
 * GET /api/live/status?entityType=&entityId= — status atual (polling leve da página). Público: não
 * revela nada além do que a página mostra (sem chave nem dono). Sem cache: o status muda a qualquer momento.
 */
export function liveStatusRoute(useCase: () => GetLiveStatus) {
  const route = queryRoute(liveStatusQuerySchema, (input) => useCase().execute(input));
  return async (request: Request) => {
    const response = await route(request);
    response.headers.set("cache-control", "no-store");
    return response;
  };
}
