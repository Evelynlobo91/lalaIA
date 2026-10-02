// Composição do módulo missions (interna): usada pelas actions e pelo index.ts.
import { placeSummaries, placesManagedBy } from "@/modules/places";
import { publicEnv } from "@/shared/config/public-env";
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { lazy } from "@/shared/kernel";
import type { MissionPlaces } from "./domain/mission";
import { AcceptMission } from "./features/accept-mission/accept-mission.use-case";
import { ListAvailableMissions, ListMyMissions } from "./features/accept-mission/mission-catalog";
import { ArchiveMission, SaveMission } from "./features/manage-missions/manage-missions.use-cases";
import { PostgresMissionRepository } from "./infra/postgres-mission-repository";
import { PostgresUserMissionRepository } from "./infra/postgres-user-mission-repository";
import { PostgresStepCompletionRepository } from "./infra/postgres-step-completion-repository";
import { GetMissionProgress } from "./features/mission-progress/mission-progress.use-case";
import { GetMissionExploration } from "./features/exploration/exploration";
import { PostgresMissionExplorationReader } from "./infra/postgres-mission-exploration-reader";
import { CompleteStep } from "./features/qr-validation/complete-step.use-case";
import { QrCodeValidator } from "./features/qr-validation/qr-code-validator";
import { QrStepValidation } from "./features/qr-validation/qr-validation.use-case";
import { GetStepQrCodes } from "./features/qr-validation/step-qr-codes.use-case";
import { HmacStepTokens } from "./infra/hmac-step-tokens";
import { missionsQrSecret } from "./infra/qr-config";
import { qrSvg } from "./infra/qr-svg";

export const missionPlaces: MissionPlaces = { summaries: placeSummaries, managedBy: placesManagedBy };

export const missionRepository = lazy(() => new PostgresMissionRepository(sql()));
export const userMissionRepository = lazy(() => new PostgresUserMissionRepository(sql()));
export const stepCompletionRepository = lazy(() => new PostgresStepCompletionRepository(sql()));

export const saveMission = lazy(() => new SaveMission(missionRepository(), missionPlaces, userMissionRepository()));
export const archiveMission = lazy(() => new ArchiveMission(missionRepository()));

export const acceptMission = lazy(() => new AcceptMission(missionRepository(), userMissionRepository()));
export const listAvailableMissions = lazy(() => new ListAvailableMissions(missionRepository(), missionPlaces));
export const listMyMissions = lazy(() => new ListMyMissions(missionRepository(), userMissionRepository(), stepCompletionRepository(), missionPlaces));
export const missionExploration = lazy(() => new GetMissionExploration(new PostgresMissionExplorationReader(sql())));
export const getMissionProgress = lazy(() => new GetMissionProgress(missionRepository(), userMissionRepository(), stepCompletionRepository(), missionPlaces));

// Validação de etapa: uma estratégia por tipo (OCP). GPS entra aqui como mais um StepValidator.
export const stepTokens = lazy(() => new HmacStepTokens(missionsQrSecret()));
const stepValidators = () => [new QrCodeValidator(stepTokens())];
export const completeStep = lazy(
  () => new CompleteStep(missionRepository(), userMissionRepository(), stepCompletionRepository(), stepValidators(), domainEvents()),
);
export const qrStepValidation = lazy(() => new QrStepValidation(stepTokens(), completeStep()));
export const stepQrCodes = lazy(
  () => new GetStepQrCodes(missionRepository(), missionPlaces, stepTokens(), { svg: qrSvg }, () => publicEnv().NEXT_PUBLIC_SITE_URL),
);
