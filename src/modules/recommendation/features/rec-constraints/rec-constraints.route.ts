import { queryRoute } from "@/shared/http/json-route";
import type { RecommendWithConstraints } from "./rec-constraints.use-case";
import { constraintParamsSchema } from "./rec-constraints.schema";

export const CONSTRAINED_LIMIT = 20;

/**
 * GET /api/recommendations/for-me?tempo=&orcamento=&pessoas=&tipo=&lat=&lon= — sugestões com as
 * restrições do formulário e os padrões do perfil da sessão. Devolve o estado efetivo + os itens.
 */
export function recConstraintsRoute(useCase: () => RecommendWithConstraints, currentUserId: () => Promise<string | null>) {
  return queryRoute(constraintParamsSchema, async (params) => useCase().execute({ userId: await currentUserId(), params, limit: CONSTRAINED_LIMIT }));
}
