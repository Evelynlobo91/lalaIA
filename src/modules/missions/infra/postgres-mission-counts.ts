import type { Sql } from "@/shared/db/sql";

/** Contagens de missões para as métricas gerais do backoffice (#145). Só números. */
export class PostgresMissionCounts {
  constructor(private readonly sql: Sql) {}

  /** Missões concluídas por exploradores em [from, to) (uma por pessoa e missão). */
  async between(from: Date, to: Date): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`
      select count(*)::int as n from missions.user_missions
      where status = 'completed' and completed_at >= ${from} and completed_at < ${to}`;
    return row.n;
  }
}
