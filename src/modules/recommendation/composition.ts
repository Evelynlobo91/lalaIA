// Composição do módulo recommendation (interna): liga as portas às APIs públicas dos outros módulos.
import { eventCandidates } from "@/modules/events";
import { favoriteKeysOf } from "@/modules/favorites";
import { userPreferences } from "@/modules/identity";
import { availableMissions } from "@/modules/missions";
import { isOpenAt, placeCandidates, placeDistances } from "@/modules/places";
import { lazy } from "@/shared/kernel";
import { logger } from "@/shared/observability";
import type { CandidateSource } from "./domain/candidate-source";
import { Ranker } from "./domain/score";
import { resolveWeights } from "./domain/score-weights";
import { defaultSignals } from "./domain/signals";
import { FindCandidates } from "./features/rec-candidates/rec-candidates.use-case";
import { RecommendNow } from "./features/rec-score/rec-score.use-case";
import { RecommendationEngine } from "./features/rec-score/recommendation-engine";
import { EventCandidateSource } from "./infra/event-candidate-source";
import { MissionCandidateSource } from "./infra/mission-candidate-source";
import { NoLiveYet } from "./infra/no-live-yet";
import { PlaceCandidateSource } from "./infra/place-candidate-source";
import { TasteProfileFromModules } from "./infra/taste-profile-from-modules";

const log = lazy(() => logger().child({ module: "recommendation" }));

/** Fontes de candidatos. Uma fonte nova (ex.: Live) entra só aqui. */
const sources = lazy((): CandidateSource[] => [
  new EventCandidateSource({ candidates: eventCandidates, distances: placeDistances }),
  new PlaceCandidateSource({ candidates: placeCandidates, isOpenAt }),
  new MissionCandidateSource({ available: availableMissions, distances: placeDistances }),
]);

export const findCandidates = lazy(() => new FindCandidates(sources(), log()));

/** Pesos: padrões de `DEFAULT_WEIGHTS`, ajustáveis por `RECOMMENDATION_WEIGHTS` (JSON) sem mudar código. */
const weights = lazy(() => {
  const { weights, problem } = resolveWeights(process.env.RECOMMENDATION_WEIGHTS);
  if (problem) log().warn("pesos da recomendação inválidos; usando os padrões", { problem });
  return weights;
});

const tasteProfiles = lazy(() => new TasteProfileFromModules({ preferencesOf: (id) => userPreferences().preferencesOf(id), favoriteKeysOf }, log()));

/** Motor determinístico (porta para o "ME SURPREENDA", #74). */
export const recommendationEngine = lazy(() => new RecommendationEngine(findCandidates(), new NoLiveYet(), new Ranker(defaultSignals, weights()), log()));

export const recommendNow = lazy(() => new RecommendNow(tasteProfiles(), recommendationEngine()));
