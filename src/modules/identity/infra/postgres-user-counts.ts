import type { Sql } from "@/shared/db/sql";

/** Contagens de contas para as métricas gerais do backoffice (#145). Só números. */
export class PostgresUserCounts {
  constructor(private readonly sql: Sql) {}

  /** Contas criadas em [from, to). */
  async between(from: Date, to: Date): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select count(*)::int as n from identity.profiles where created_at >= ${from} and created_at < ${to}`;
    return row.n;
  }

  async total(): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select count(*)::int as n from identity.profiles`;
    return row.n;
  }
}
