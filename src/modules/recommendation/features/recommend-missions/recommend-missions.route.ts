import { queryRoute } from "@/shared/http/json-route";
import { recommendMissionsSchema } from "./recommend-missions.schema";
import type { RecommendMissions } from "./recommend-missions.use-case";

/**
 * GET /api/recommendations/missions?tempo=&orcamento=&pessoas=&tipo=&lat=&lon= — missões ordenadas por relevância,
 * com motivos, respeitando tempo e orçamento. Perfil da sessão (ou visitante). Parâmetro inválido → 400.
 */
export function recommendMissionsRoute(useCase: () => RecommendMissions, currentUserId: () => Promise<string | null>) {
  return queryRoute(recommendMissionsSchema, async (params) => useCase().execute({ userId: await currentUserId(), params }));
}
