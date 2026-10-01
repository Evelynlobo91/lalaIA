export { liveTargetSchema as liveStatusQuerySchema } from "../player/player.schema";

/** Intervalo do polling de status na POC (só com a aba visível). Evolução: Supabase Realtime (docs/live.md). */
export const LIVE_STATUS_POLL_MS = 12_000;
