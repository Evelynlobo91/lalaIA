// API pública do módulo recommendation (motor de recomendação, epic #11).
import { findCandidates } from "./composition";
import { recCandidatesRoute } from "./features/rec-candidates/rec-candidates.route";

export type { Candidate, CandidateKind, Availability } from "./domain/candidate";
export type { SearchConstraints } from "./domain/constraints";

export const recommendationApi = {
  /** GET /api/recommendations/candidates — candidatos viáveis agora (camada 1, sem ranking). */
  candidates: recCandidatesRoute(findCandidates),
};
