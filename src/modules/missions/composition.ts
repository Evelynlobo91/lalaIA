// Composição do módulo missions (interna): usada pelas actions e pelo index.ts.
import { placeSummaries, placesManagedBy } from "@/modules/places";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { MissionPlaces } from "./domain/mission";
import { AcceptMission } from "./features/accept-mission/accept-mission.use-case";
import { ListAvailableMissions, ListMyMissions } from "./features/accept-mission/mission-catalog";
import { ArchiveMission, SaveMission } from "./features/manage-missions/manage-missions.use-cases";
import { PostgresMissionRepository } from "./infra/postgres-mission-repository";
import { PostgresUserMissionRepository } from "./infra/postgres-user-mission-repository";

export const missionPlaces: MissionPlaces = { summaries: placeSummaries, managedBy: placesManagedBy };

export const missionRepository = lazy(() => new PostgresMissionRepository(sql()));
export const userMissionRepository = lazy(() => new PostgresUserMissionRepository(sql()));

export const saveMission = lazy(() => new SaveMission(missionRepository(), missionPlaces, userMissionRepository()));
export const archiveMission = lazy(() => new ArchiveMission(missionRepository()));

export const acceptMission = lazy(() => new AcceptMission(missionRepository(), userMissionRepository()));
export const listAvailableMissions = lazy(() => new ListAvailableMissions(missionRepository(), missionPlaces));
export const listMyMissions = lazy(() => new ListMyMissions(missionRepository(), userMissionRepository(), missionPlaces));
