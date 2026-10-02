import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { LevelUp, LevelUpRepository } from "../domain/levels";

/** Níveis alcançados (append-only). Escrita só pelo backend; leitura como o próprio usuário (RLS). */
export class PostgresLevelUpRepository implements LevelUpRepository {
  constructor(private readonly sql: Sql) {}

  async record(userId: string, level: number): Promise<boolean> {
    const rows = await this.sql`
      insert into progression.level_ups (user_id, level) values (${userId}, ${level})
      on conflict do nothing returning level`;
    return rows.length > 0;
  }

  async latest(userId: string): Promise<LevelUp | null> {
    const [row] = await asUser(
      userId,
      (tx) => tx<{ level: number; reached_at: Date }[]>`
        select level, reached_at from progression.level_ups where user_id = ${userId} order by level desc limit 1`,
      this.sql,
    );
    return row ? { level: row.level, reachedAt: row.reached_at } : null;
  }
}
