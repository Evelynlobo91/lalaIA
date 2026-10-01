import type { Sql } from "@/shared/db/sql";
import type { DailyMetric, DailyMetricsReader, DailyMetricsQuery } from "../domain/daily-metrics";
import type { InteractionEntityType, InteractionKind } from "../domain/interaction";

type Row = { day: string; entity_type: InteractionEntityType; entity_id: string; kind: InteractionKind; total: number };

/**
 * Dias fechados (antes de hoje) vêm de `analytics.daily_metrics` (materialized view, refresh a cada 10 min);
 * hoje vem de `analytics.events` pelo índice por entidade. Uma consulta só (union all).
 */
export class PostgresDailyMetrics implements DailyMetricsReader {
  constructor(private readonly sql: Sql) {}

  async daily(q: DailyMetricsQuery & { today: string }): Promise<DailyMetric[]> {
    const types: string[] = [];
    const ids: string[] = [];
    for (const [type, list] of Object.entries(q.refs)) {
      for (const id of list ?? []) {
        types.push(type);
        ids.push(id);
      }
    }
    if (ids.length === 0) return [];

    const rows = await this.sql<Row[]>`
      with alvo as (select * from unnest(${types}::text[], ${ids}::uuid[]) as r(entity_type, entity_id))
      select m.day::text as day, m.entity_type, m.entity_id, m.kind, m.total
      from analytics.daily_metrics m
      join alvo using (entity_type, entity_id)
      where m.day between ${q.from}::date and least(${q.to}::date, ${q.today}::date - 1)
      union all
      select ${q.today}::text, e.entity_type, e.entity_id, e.kind, count(*)::int
      from analytics.events e
      join alvo using (entity_type, entity_id)
      where ${q.today}::date between ${q.from}::date and ${q.to}::date
        and e.occurred_at >= (${q.today}::date::timestamp at time zone 'America/Sao_Paulo')
        and e.occurred_at < ((${q.today}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
      group by e.entity_type, e.entity_id, e.kind
      order by 1, 2, 3, 4`;
    return rows.map((r) => ({ day: r.day, entityType: r.entity_type, entityId: r.entity_id, kind: r.kind, total: Number(r.total) }));
  }
}
