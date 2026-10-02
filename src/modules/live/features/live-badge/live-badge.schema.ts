import { z } from "zod";

/** GET /api/live/active e /api/live/map: sem parâmetros (outros query params são ignorados). */
export const liveNowQuerySchema = z.object({});

/** Quantas lives no ar a lista "Com live agora" e o mapa mostram (Joinville: dezenas, no máximo). */
export const LIVE_NOW_MAX = 50;

export { LIVE_NOW_POLL_MS } from "./live-badge.constants";

/** Cache curto na CDN para o selo: todo mundo vê a mesma lista, e 10 s de atraso não mudam a decisão. */
export const LIVE_NOW_CACHE_CONTROL = "public, max-age=0, s-maxage=10, stale-while-revalidate=20";
