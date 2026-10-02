// Conquistas (#67, RF32): cada uma é uma regra (estratégia). Nova conquista = nova regra no catálogo (OCP).

/** Fatos sobre a pessoa que as regras avaliam (derivados das APIs públicas e do saldo de XP). */
export type AchievementFacts = {
  completedMissions: number;
  checkIns: number;
  favoritePlaces: number;
  exploredCategories: number;
  level: number;
};

export interface AchievementRule {
  /** Id estável (gravado no banco): minúsculas, números e hífen. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Dica exibida enquanto está bloqueada. */
  readonly hint: string;
  /** XP bônus creditado no livro-razão ao desbloquear (0 = sem bônus). */
  readonly bonusXp: number;
  isMet(facts: AchievementFacts): boolean;
}

export type UnlockedAchievement = { achievementId: string; unlockId: string; unlockedAt: Date };

/** Conquistas desbloqueadas (append-only, unique por usuário e conquista). */
export interface AchievementRepository {
  /** Id do desbloqueio se gravou agora; null se já estava desbloqueada (idempotente). */
  unlock(userId: string, achievementId: string): Promise<string | null>;
  /** Como o próprio usuário (RLS). */
  listUnlocked(userId: string): Promise<UnlockedAchievement[]>;
}

export interface AchievementFactsSource {
  factsOf(userId: string): Promise<AchievementFacts>;
}
