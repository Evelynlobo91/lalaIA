// Composição do módulo progression (interna): usada pelo index.ts.
import { missionTitle } from "@/modules/missions";
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { lazy } from "@/shared/kernel";
import type { MissionTitles } from "./domain/xp";
import { GetLevelOverview, TrackLevelUp } from "./features/levels/levels.use-case";
import { GetXpOverview, GrantXp } from "./features/xp-ledger/xp-ledger.use-case";
import { PostgresLevelUpRepository } from "./infra/postgres-level-up-repository";
import { PostgresXpLedger } from "./infra/postgres-xp-ledger";

const missionTitles: MissionTitles = { titleOf: missionTitle };

export const xpLedger = lazy(() => new PostgresXpLedger(sql()));
export const grantXp = lazy(() => new GrantXp(xpLedger(), missionTitles, domainEvents()));
export const xpOverview = lazy(() => new GetXpOverview(xpLedger()));

export const levelUps = lazy(() => new PostgresLevelUpRepository(sql()));
export const trackLevelUp = lazy(() => new TrackLevelUp(xpLedger(), levelUps(), domainEvents()));
export const levelOverview = lazy(() => new GetLevelOverview(xpLedger(), levelUps()));
