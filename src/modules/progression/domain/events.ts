// Eventos de domínio do módulo progression (payload só com ids e números).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    /** XP creditado no livro-razão (só quando a transação é nova). Usado para recalcular o nível. */
    "progression.XpGranted": { userId: string; amount: number; reason: string };
    /** A pessoa alcançou um nível pela primeira vez (publicado uma vez por usuário e nível). */
    "progression.LevelReached": { userId: string; level: number };
    /** Conquista desbloqueada pela primeira vez. `unlockId` é a origem do bônus de XP no livro-razão. */
    "progression.AchievementUnlocked": { userId: string; achievementId: string; unlockId: string; title: string; bonusXp: number };
  }
}

export {};
