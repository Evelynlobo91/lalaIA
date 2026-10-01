// Composição do módulo recommendation (interna): liga as portas às APIs públicas dos outros módulos.
import { eventCandidates } from "@/modules/events";
import { favoriteKeysOf } from "@/modules/favorites";
import { userPreferences } from "@/modules/identity";
import { listActiveStreams } from "@/modules/live";
import { availableMissions } from "@/modules/missions";
import { isOpenAt, placeCandidates, placeDistances, placeFacets } from "@/modules/places";
import { lazy } from "@/shared/kernel";
import { logger } from "@/shared/observability";
import type { CandidateSource } from "./domain/candidate-source";
import { Ranker } from "./domain/score";
import { resolveWeights } from "./domain/score-weights";
import { defaultSignals } from "./domain/signals";
import { RealtimeFeed } from "./features/realtime-feed/realtime-feed.use-case";
import { FindCandidates } from "./features/rec-candidates/rec-candidates.use-case";
import { RecommendWithConstraints } from "./features/rec-constraints/rec-constraints.use-case";
import { RecommendNow } from "./features/rec-score/rec-score.use-case";
import { RecommendationEngine } from "./features/rec-score/recommendation-engine";
import { EventCandidateSource } from "./infra/event-candidate-source";
import { MissionCandidateSource } from "./infra/mission-candidate-source";
import { LiveStreamsStatus } from "./infra/live-streams-status";
import { PlaceCandidateSource } from "./infra/place-candidate-source";
import { TasteProfileFromModules } from "./infra/taste-profile-from-modules";
import { SurpriseMe } from "./features/surprise-me/surprise-me.use-case";
import { RecommendMissions } from "./features/recommend-missions/recommend-missions.use-case";
import { ClaudeItineraryPlanner } from "./infra/claude-itinerary-planner";
import { LocalItineraryPlanner } from "./infra/local-itinerary-planner";
import { claudePlannerConfig } from "./infra/planner-config";

const log = lazy(() => logger().child({ module: "recommendation" }));

/** Fontes de candidatos. Uma fonte nova (ex.: Live) entra só aqui. */
const sources = lazy((): CandidateSource[] => [
  new EventCandidateSource({ candidates: eventCandidates, distances: placeDistances }),
  new PlaceCandidateSource({ candidates: placeCandidates, isOpenAt }),
  missionSource(),
]);

/** Missões como candidatos: categoria derivada dos lugares das etapas (placeFacets), sem join entre schemas. */
const missionSource = lazy(() => new MissionCandidateSource({ available: availableMissions, distances: placeDistances, facets: placeFacets }));

export const findCandidates = lazy(() => new FindCandidates(sources(), log()));

/** Pesos: padrões de `DEFAULT_WEIGHTS`, ajustáveis por `RECOMMENDATION_WEIGHTS` (JSON) sem mudar código. */
const weights = lazy(() => {
  const { weights, problem } = resolveWeights(process.env.RECOMMENDATION_WEIGHTS);
  if (problem) log().warn("pesos da recomendação inválidos; usando os padrões", { problem });
  return weights;
});

const tasteProfiles = lazy(() => new TasteProfileFromModules({ preferencesOf: (id) => userPreferences().preferencesOf(id), favoriteKeysOf }, log()));

/** Motor determinístico (porta para o "ME SURPREENDA", #74). */
export const recommendationEngine = lazy(() => new RecommendationEngine(findCandidates(), new LiveStreamsStatus(() => listActiveStreams()), new Ranker(defaultSignals, weights()), log()));

export const recommendNow = lazy(() => new RecommendNow(tasteProfiles(), recommendationEngine()));

export const recommendWithConstraints = lazy(() => new RecommendWithConstraints(recommendNow()));

/**
 * "Missões para você" (#64): o mesmo motor (filtros, sinais e pesos), com só a fonte de missões.
 * Não reaproveita o motor geral porque o top N geral cortaria missões atrás de lugares e eventos.
 */
const missionEngine = lazy(
  () => new RecommendationEngine(new FindCandidates([missionSource()], log()), new LiveStreamsStatus(() => listActiveStreams()), new Ranker(defaultSignals, weights()), log()),
);
export const recommendMissions = lazy(() => new RecommendMissions(new RecommendWithConstraints(new RecommendNow(tasteProfiles(), missionEngine()))));

export const realtimeFeed = lazy(() => new RealtimeFeed(recommendNow()));

/** "ME SURPREENDA" (#74): Claude quando há `ANTHROPIC_API_KEY`; senão (ou se falhar), o motor local. */
export const surpriseMe = lazy(() => {
  const config = claudePlannerConfig();
  return new SurpriseMe(tasteProfiles(), recommendationEngine(), config ? new ClaudeItineraryPlanner(config) : null, new LocalItineraryPlanner(), log());
});
