// API pública do módulo progression (XP, níveis e conquistas).
import type { ModuleSubscriptions } from "@/shared/events";
import "./domain/events";
import { achievementsOverview, grantXp, levelOverview, trackLevelUp, unlockAchievements, xpOverview } from "./composition";
import type { AchievementsOverview } from "./features/achievements/achievements.use-case";
import type { LevelOverview } from "./features/levels/levels.use-case";
import type { XpOverview } from "./features/xp-ledger/xp-ledger.use-case";

export { XpCard } from "./features/xp-ledger/ui/xp-card";
export { LevelCard } from "./features/levels/ui/level-card";
export { AchievementsCard } from "./features/achievements/ui/achievements-card";
export type { AchievementsOverview, AchievementView } from "./features/achievements/achievements.use-case";
export type { XpOverview } from "./features/xp-ledger/xp-ledger.use-case";
export type { LevelOverview } from "./features/levels/levels.use-case";
export type { XpReason, XpTransaction } from "./domain/xp";
export { LEVELS, levelFor, type LevelDefinition, type LevelStatus } from "./domain/levels";

/** Saldo de XP e últimas transações do usuário (perfil). O id vem sempre da sessão. */
export function xpOverviewOf(userId: string, limit = 10): Promise<XpOverview> {
  return xpOverview().execute(userId, limit);
}

/** Nível atual, progresso até o próximo e subida recente (perfil). O id vem sempre da sessão. */
export function levelOverviewOf(userId: string): Promise<LevelOverview> {
  return levelOverview().execute(userId);
}

/** Galeria de conquistas (desbloqueadas e bloqueadas com dica). O id vem sempre da sessão. */
export function achievementsOf(userId: string): Promise<AchievementsOverview> {
  return achievementsOverview().execute(userId);
}

/**
 * Reações a eventos (registradas no boot, em src/bootstrap).
 * Missões não concedem XP: publicam o fato e este módulo credita no livro-razão (idempotente).
 * Cada crédito novo publica progression.XpGranted, que recalcula o nível.
 * Conquistas são avaliadas a cada fato relevante; o desbloqueio publica AchievementUnlocked, que credita o bônus.
 */
export const subscriptions: ModuleSubscriptions = (bus) => {
  bus.subscribe("missions.StepCompleted", async (event) => {
    await grantXp().onStepCompleted(event);
  });
  bus.subscribe("missions.MissionCompleted", async (event) => {
    await grantXp().onMissionCompleted(event);
  });
  bus.subscribe("progression.XpGranted", async (event) => {
    await trackLevelUp().onXpGranted(event);
  });
  for (const trigger of ["missions.StepCompleted", "missions.MissionCompleted", "favorites.FavoriteAdded", "progression.LevelReached"] as const) {
    bus.subscribe(trigger, async (event) => {
      await unlockAchievements().onTrigger(event);
    });
  }
  bus.subscribe("progression.AchievementUnlocked", async (event) => {
    await grantXp().onAchievementUnlocked(event);
  });
};
