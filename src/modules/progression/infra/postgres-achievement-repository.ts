import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { AchievementRepository, UnlockedAchievement } from "../domain/achievements";

/** Conquistas desbloqueadas (append-only). Escrita só pelo backend; leitura como o próprio usuário (RLS). */
export class PostgresAchievementRepository implements AchievementRepository {
  constructor(private readonly sql: Sql) {}

  async unlock(userId: string, achievementId: string): Promise<string | null> {
    const [row] = await this.sql<{ id: string }[]>`
      insert into progression.achievements (user_id, achievement_id) values (${userId}, ${achievementId})
      on conflict (user_id, achievement_id) do nothing returning id`;
    return row?.id ?? null;
  }

  async listUnlocked(userId: string): Promise<UnlockedAchievement[]> {
    const rows = await asUser(
      userId,
      (tx) => tx<{ id: string; achievement_id: string; unlocked_at: Date }[]>`
        select id, achievement_id, unlocked_at from progression.achievements where user_id = ${userId} order by unlocked_at desc`,
      this.sql,
    );
    return rows.map((r) => ({ achievementId: r.achievement_id, unlockId: r.id, unlockedAt: r.unlocked_at }));
  }
}
