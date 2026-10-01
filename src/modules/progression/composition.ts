// Composição do módulo progression (interna): usada pelo index.ts.
import { eventSummaries } from "@/modules/events";
import { favoriteKeysOf } from "@/modules/favorites";
import { missionExplorationOf, missionTitle } from "@/modules/missions";
import { placeFacets } from "@/modules/places";
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { lazy } from "@/shared/kernel";
import type { MissionTitles } from "./domain/xp";
import { ACHIEVEMENTS } from "./features/achievements/achievement-catalog";
import { ExplorerAchievementFacts, GetAchievements, UnlockAchievements } from "./features/achievements/achievements.use-case";
import { GetLevelOverview, TrackLevelUp } from "./features/levels/levels.use-case";
import { GetXpOverview, GrantXp } from "./features/xp-ledger/xp-ledger.use-case";
import { PostgresAchievementRepository } from "./infra/postgres-achievement-repository";
import { PublicApiExplorerActivity } from "./infra/public-api-explorer-activity";
import { PostgresLevelUpRepository } from "./infra/postgres-level-up-repository";
import { PostgresXpLedger } from "./infra/postgres-xp-ledger";

const missionTitles: MissionTitles = { titleOf: missionTitle };

export const xpLedger = lazy(() => new PostgresXpLedger(sql()));
export const grantXp = lazy(() => new GrantXp(xpLedger(), missionTitles, domainEvents()));
export const xpOverview = lazy(() => new GetXpOverview(xpLedger()));

export const levelUps = lazy(() => new PostgresLevelUpRepository(sql()));
export const trackLevelUp = lazy(() => new TrackLevelUp(xpLedger(), levelUps(), domainEvents()));
export const levelOverview = lazy(() => new GetLevelOverview(xpLedger(), levelUps()));

// Atividade do explorador pelas APIs públicas dos módulos de origem (sem join entre schemas).
export const explorerActivity = lazy(() => new PublicApiExplorerActivity({ missionExplorationOf, favoriteKeysOf, placeFacets, eventSummaries }));
export const achievements = lazy(() => new PostgresAchievementRepository(sql()));
export const unlockAchievements = lazy(
  () => new UnlockAchievements(ACHIEVEMENTS, new ExplorerAchievementFacts(explorerActivity(), xpLedger()), achievements(), domainEvents()),
);
export const achievementsOverview = lazy(() => new GetAchievements(ACHIEVEMENTS, achievements()));
