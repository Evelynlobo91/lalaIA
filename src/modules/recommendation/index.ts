// API pública do módulo recommendation (motor de recomendação, epic #11).
import { getCurrentUser } from "@/modules/identity";
import { findCandidates, recommendationEngine, recommendNow } from "./composition";
import { recCandidatesRoute } from "./features/rec-candidates/rec-candidates.route";
import { recScoreRoute } from "./features/rec-score/rec-score.route";

export type { Candidate, CandidateKind, Availability } from "./domain/candidate";
export type { SearchConstraints } from "./domain/constraints";
export type { Recommendation, Reason } from "./domain/score";
export type { TasteProfile } from "./domain/taste-profile";
export type { RecommendationItem } from "./features/rec-score/recommendation-item";
export { RecommendationCard, RecommendationList } from "./features/rec-score/ui/recommendation-card";

/**
 * Motor determinístico (candidatos + filtros + score). Porta para o "ME SURPREENDA" (#74):
 * `recommendationEngine().recommend(constraints, profile, 20)` devolve os melhores candidatos com motivos.
 */
export { recommendationEngine };

const currentUserId = async () => (await getCurrentUser())?.id ?? null;

export const recommendationApi = {
  /** GET /api/recommendations/candidates — candidatos viáveis agora (camada 1, sem ranking). */
  candidates: recCandidatesRoute(findCandidates),
  /** GET /api/recommendations — sugestões ranqueadas, com motivos. */
  recommendations: recScoreRoute(recommendNow, currentUserId),
};
