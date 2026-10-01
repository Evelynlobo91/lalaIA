import { queryRoute } from "@/shared/http/json-route";
import type { RealtimeFeed } from "./realtime-feed.use-case";
import { realtimeFeedSchema } from "./realtime-feed.schema";

/** GET /api/recommendations/now?lat=&lon= — feed "Agora perto de você" (perfil da sessão). */
export function realtimeFeedRoute(feed: () => RealtimeFeed, currentUserId: () => Promise<string | null>) {
  return queryRoute(realtimeFeedSchema, async ({ origin }) => feed().execute({ userId: await currentUserId(), origin }));
}
