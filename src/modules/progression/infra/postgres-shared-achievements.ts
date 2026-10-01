import type { Sql } from "@/shared/db/sql";
import type { SharedAchievementReader } from "../features/share/share.use-case";

/**
 * Leitura pública de um desbloqueio pelo id do link. Pelo backend (sem asUser): quem abre o link não é o
 * dono. Só devolve conquista, dono e data; o id é um uuid aleatório que só existe no link compartilhado.
 */
export class PostgresSharedAchievements implements SharedAchievementReader {
  constructor(private readonly sql: Sql) {}

  async findByUnlockId(unlockId: string) {
    const [row] = await this.sql<{ achievement_id: string; user_id: string; unlocked_at: Date }[]>`
      select achievement_id, user_id, unlocked_at from progression.achievements where id = ${unlockId}`;
    return row ? { achievementId: row.achievement_id, userId: row.user_id, unlockedAt: row.unlocked_at } : null;
  }
}
