import type { Sql } from "@/shared/db/sql";

/** Contagens de lives para as métricas gerais do backoffice (#145). Só números. */
export class PostgresLiveCounts {
  constructor(private readonly sql: Sql) {}

  /** Transmissões que estiveram no ar em [from, to): cada transmissão conta uma vez, mesmo com várias entradas ao vivo. */
  async between(from: Date, to: Date): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`
      select count(distinct stream_id)::int as n from live.stream_lifecycle_events
      where status_after = 'live' and occurred_at >= ${from} and occurred_at < ${to}`;
    return row.n;
  }
}
