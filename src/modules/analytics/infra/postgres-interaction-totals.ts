import type { Sql } from "@/shared/db/sql";
import type { InteractionEntityType, InteractionKind } from "../domain/interaction";
import type { InteractionTotalsReader } from "../features/interaction-totals/interaction-totals";

/**
 * Totais por entidade e tipo numa consulta só, pelo índice `events_entity_idx`
 * (entity_type, entity_id, kind, occurred_at desc): o filtro e o agrupamento seguem a ordem do índice.
 */
export class PostgresInteractionTotals implements InteractionTotalsReader {
  constructor(private readonly sql: Sql) {}

  async totals(entityType: InteractionEntityType, entityIds: string[], since: Date | null) {
    const rows = await this.sql<{ entity_id: string; kind: InteractionKind; total: number }[]>`
      select entity_id, kind, count(*)::int as total
      from analytics.events
      where entity_type = ${entityType}
        and entity_id = any(${entityIds}::uuid[])
        ${since ? this.sql`and occurred_at >= ${since}` : this.sql``}
      group by entity_id, kind`;
    return rows.map((r) => ({ entityId: r.entity_id, kind: r.kind, total: r.total }));
  }
}
