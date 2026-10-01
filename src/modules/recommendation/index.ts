// API pública do módulo recommendation (motor de recomendação, epic #11).
import { getCurrentUser } from "@/modules/identity";
import { findCandidates, recommendationEngine, recommendNow, recommendWithConstraints } from "./composition";
import { CONSTRAINED_LIMIT, recConstraintsRoute } from "./features/rec-constraints/rec-constraints.route";
import { parseConstraintParams } from "./features/rec-constraints/rec-constraints.schema";
import { recCandidatesRoute } from "./features/rec-candidates/rec-candidates.route";
import { recScoreRoute } from "./features/rec-score/rec-score.route";

export type { Candidate, CandidateKind, Availability } from "./domain/candidate";
export type { SearchConstraints } from "./domain/constraints";
export type { Recommendation, Reason } from "./domain/score";
export type { TasteProfile } from "./domain/taste-profile";
export type { RecommendationItem } from "./features/rec-score/recommendation-item";
export { RecommendationCard, RecommendationList } from "./features/rec-score/ui/recommendation-card";
export { ConstraintsForm, constraintsSummary } from "./features/rec-constraints/ui/constraints-form";
export type { ConstraintState } from "./features/rec-constraints/rec-constraints.use-case";

/**
 * Motor determinístico (candidatos + filtros + score). Porta para o "ME SURPREENDA" (#74):
 * `recommendationEngine().recommend(constraints, profile, 20)` devolve os melhores candidatos com motivos.
 */
export { recommendationEngine };

const currentUserId = async () => (await getCurrentUser())?.id ?? null;

/**
 * RF43 — Sugestões com as restrições da URL (/sugestoes) e os padrões do perfil da sessão.
 * Restrição inválida → `invalid` com a mensagem, e a página segue com os padrões.
 */
export async function constrainedRecommendations(params: Record<string, string | string[] | undefined>) {
  const { params: parsed, invalid } = parseConstraintParams(params);
  const result = await recommendWithConstraints().execute({ userId: await currentUserId(), params: parsed, limit: CONSTRAINED_LIMIT });
  if (!result.ok) throw result.error;
  return { invalid, ...result.value };
}

export const recommendationApi = {
  /** GET /api/recommendations/candidates — candidatos viáveis agora (camada 1, sem ranking). */
  candidates: recCandidatesRoute(findCandidates),
  /** GET /api/recommendations — sugestões ranqueadas, com motivos. */
  recommendations: recScoreRoute(recommendNow, currentUserId),
  /** GET /api/recommendations/for-me — com as restrições do formulário e os padrões do perfil. */
  forMe: recConstraintsRoute(recommendWithConstraints, currentUserId),
};
