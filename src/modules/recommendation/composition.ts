// Composição do módulo recommendation (interna): liga as portas às APIs públicas dos outros módulos.
import { eventCandidates } from "@/modules/events";
import { availableMissions } from "@/modules/missions";
import { isOpenAt, placeCandidates, placeDistances } from "@/modules/places";
import { lazy } from "@/shared/kernel";
import { logger } from "@/shared/observability";
import type { CandidateSource } from "./domain/candidate-source";
import { FindCandidates } from "./features/rec-candidates/rec-candidates.use-case";
import { EventCandidateSource } from "./infra/event-candidate-source";
import { MissionCandidateSource } from "./infra/mission-candidate-source";
import { PlaceCandidateSource } from "./infra/place-candidate-source";

const log = lazy(() => logger().child({ module: "recommendation" }));

/** Fontes de candidatos. Uma fonte nova (ex.: Live) entra só aqui. */
const sources = lazy((): CandidateSource[] => [
  new EventCandidateSource({ candidates: eventCandidates, distances: placeDistances }),
  new PlaceCandidateSource({ candidates: placeCandidates, isOpenAt }),
  new MissionCandidateSource({ available: availableMissions, distances: placeDistances }),
]);

export const findCandidates = lazy(() => new FindCandidates(sources(), log()));
