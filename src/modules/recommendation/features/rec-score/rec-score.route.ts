import { queryRoute } from "@/shared/http/json-route";
import { ok } from "@/shared/kernel";
import { recScoreSchema } from "./rec-score.schema";
import type { RecommendNow } from "./rec-score.use-case";

/**
 * GET /api/recommendations — sugestões ranqueadas com motivos. O usuário vem da sessão (perfil e
 * favoritos); visitante recebe um ranking sem gosto pessoal.
 */
export function recScoreRoute(recommend: () => RecommendNow, currentUserId: () => Promise<string | null>, clock: () => Date = () => new Date()) {
  return queryRoute(recScoreSchema, async ({ constraints, limit }) => {
    const now = clock();
    const result = await recommend().execute({ userId: await currentUserId(), limit, constraintsFor: () => ({ ...constraints, now }) });
    return result.ok ? ok({ items: result.value.items }) : result;
  });
}
