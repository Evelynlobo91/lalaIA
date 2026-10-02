import type { Sql } from "@/shared/db/sql";

/** Contagens de eventos para as métricas gerais do backoffice (#145). Só números. */
export class PostgresEventCounts {
  constructor(private readonly sql: Sql) {}

  /** Eventos publicados (criados) em [from, to), inclusive os cancelados depois. */
  async between(from: Date, to: Date): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select count(*)::int as n from events.events where created_at >= ${from} and created_at < ${to}`;
    return row.n;
  }
}
