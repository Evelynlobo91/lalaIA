import { queryRoute } from "@/shared/http/json-route";
import { ok } from "@/shared/kernel";
import type { FindCandidates } from "./rec-candidates.use-case";
import { recCandidatesSchema } from "./rec-candidates.schema";

/** GET /api/recommendations/candidates — candidatos viáveis agora (camada 1, sem ranking). */
export function recCandidatesRoute(findCandidates: () => FindCandidates, clock: () => Date = () => new Date()) {
  return queryRoute(recCandidatesSchema, async (input) => {
    const items = await findCandidates().execute({ ...input, now: clock() });
    return ok({ items });
  });
}
