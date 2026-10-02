import type { Sql } from "@/shared/db/sql";
import type { AuditEntry, AuditFilter, AuditLog, AuditTargetType } from "../domain/audit";

type Row = { event_id: string; actor_id: string; action: string; target_type: AuditTargetType; target_id: string; occurred_at: Date };

/** Trilha de auditoria no Postgres. A tabela é append-only (trigger) e fica fora da API. */
export class PostgresAuditLog implements AuditLog {
  constructor(private readonly sql: Sql) {}

  async append(e: AuditEntry): Promise<void> {
    await this.sql`
      insert into backoffice.audit_log (event_id, actor_id, action, target_type, target_id, occurred_at)
      values (${e.eventId}, ${e.actorId}, ${e.action}, ${e.targetType}, ${e.targetId}, ${e.occurredAt})
      on conflict (event_id) do nothing`;
  }

  async list(f: AuditFilter): Promise<AuditEntry[]> {
    const sql = this.sql;
    const rows = await sql<Row[]>`
      select event_id, actor_id, action, target_type, target_id, occurred_at
      from backoffice.audit_log
      where true
        ${f.action ? sql`and action = ${f.action}` : sql``}
        ${f.actorId ? sql`and actor_id = ${f.actorId}` : sql``}
        ${f.since ? sql`and occurred_at >= ${f.since}` : sql``}
      order by occurred_at desc, id desc
      limit ${f.limit}`;
    return rows.map((r) => ({ eventId: r.event_id, actorId: r.actor_id, action: r.action, targetType: r.target_type, targetId: r.target_id, occurredAt: r.occurred_at }));
  }
}
