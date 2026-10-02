import type { Sql } from "@/shared/db/sql";

/** Contagens de parceiros para as métricas gerais do backoffice (#145). Só números. */
export class PostgresPartnerCounts {
  constructor(private readonly sql: Sql) {}

  /** Cadastros aprovados em [from, to) (inclui quem foi suspenso depois). */
  async between(from: Date, to: Date): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`
      select count(*)::int as n from partners.partners
      where status in ('approved', 'suspended') and reviewed_at >= ${from} and reviewed_at < ${to}`;
    return row.n;
  }

  /** Parceiros ativos hoje (aprovados e não suspensos). */
  async total(): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select count(*)::int as n from partners.partners where status = 'approved'`;
    return row.n;
  }
}
