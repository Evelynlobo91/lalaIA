// Composição do módulo missions (interna): usada pelas actions e pelo index.ts.
import { placeSummaries, placesManagedBy } from "@/modules/places";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { MissionPlaces } from "./domain/mission";
import { ArchiveMission, SaveMission } from "./features/manage-missions/manage-missions.use-cases";
import { PostgresMissionRepository } from "./infra/postgres-mission-repository";

export const missionPlaces: MissionPlaces = { summaries: placeSummaries, managedBy: placesManagedBy };

export const missionRepository = lazy(() => new PostgresMissionRepository(sql()));
export const saveMission = lazy(() => new SaveMission(missionRepository(), missionPlaces));
export const archiveMission = lazy(() => new ArchiveMission(missionRepository()));
