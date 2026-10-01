// Composição do módulo progression (interna): usada pelo index.ts.
import { eventCandidates, eventSummaries } from "@/modules/events";
import { favoriteKeysOf } from "@/modules/favorites";
import { availableMissions, missionExplorationOf, missionTitle, myMissions } from "@/modules/missions";
import { allPlacePoints, placeFacets } from "@/modules/places";
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { lazy } from "@/shared/kernel";
import type { MissionTitles } from "./domain/xp";
import { ACHIEVEMENTS } from "./features/achievements/achievement-catalog";
import { ExplorerAchievementFacts, GetAchievements, UnlockAchievements } from "./features/achievements/achievements.use-case";
import { GetExplorerProfile } from "./features/explorer-profile/explorer-profile.use-case";
import { GetGameMap, type GameMapSources } from "./features/game-map/game-map.use-case";
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
export const explorerProfile = lazy(() => new GetExplorerProfile(explorerActivity()));
export const achievementsOverview = lazy(() => new GetAchievements(ACHIEVEMENTS, achievements()));

// Mapa de exploração (#69): fontes pelas APIs públicas de places, missions e events.
const gameMapSources: GameMapSources = {
  allPlaces: async () => (await allPlacePoints()).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon })),
  activeMissionPlaces: async (userId) =>
    (await myMissions(userId)).filter((m) => m.userMission.status === "active").flatMap((m) => m.places.map((p) => p.id)),
  availableMissionPlaces: async () => (await availableMissions()).flatMap((m) => m.places.map((p) => p.id)),
  happeningEventPlaces: async (now) =>
    (await eventCandidates({ from: now, to: new Date(now.getTime() + 1), limit: 100 })).filter((e) => e.startsAt <= now && now < e.endsAt).map((e) => e.placeId),
};
export const gameMap = lazy(() => new GetGameMap(gameMapSources, explorerActivity()));
