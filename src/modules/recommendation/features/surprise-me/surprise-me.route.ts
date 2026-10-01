import { queryRoute } from "@/shared/http/json-route";
import { surpriseMeSchema } from "./surprise-me.schema";
import type { SurpriseMe } from "./surprise-me.use-case";

/** GET /api/recommendations/surprise?tempo=&orcamento=&pessoas=&tipo=&lat=&lon= — roteiro pronto. */
export function surpriseMeRoute(useCase: () => SurpriseMe, currentUserId: () => Promise<string | null>) {
  return queryRoute(surpriseMeSchema, async (params) => useCase().execute({ userId: await currentUserId(), params }));
}
