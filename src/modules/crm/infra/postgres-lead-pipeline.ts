import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { Lead, LeadStage } from "../domain/lead";
import type { LeadPipeline, StageChange } from "../domain/pipeline";
import { LEAD_COLUMNS, toLead, type LeadRow } from "./postgres-lead-repository";

/** Mudança de etapa + histórico na mesma transação, como o usuário da sessão (RLS por capacidade). */
export class PostgresLeadPipeline implements LeadPipeline {
  constructor(private readonly sql: Sql) {}

  async move(actorId: string, leadId: string, from: LeadStage, to: LeadStage, reason: string | null): Promise<Lead | null> {
    return asUser(
      actorId,
      async (tx) => {
        // `stage = from`: se outra pessoa moveu antes, nenhuma linha é alterada (e nada entra no histórico).
        const [row] = await tx.unsafe<LeadRow[]>(`update crm.leads set stage = $3, lost_reason = $4 where id = $1 and stage = $2 returning ${LEAD_COLUMNS}`, [
          leadId,
          from,
          to,
          to === "perdido" ? reason : null,
        ]);
        if (!row) return null;
        await tx`insert into crm.lead_stage_history (lead_id, from_stage, to_stage, changed_by, reason) values (${leadId}, ${from}, ${to}, ${actorId}, ${reason})`;
        return toLead(row);
      },
      this.sql,
    );
  }

  async history(actorId: string, leadId: string): Promise<StageChange[]> {
    const rows = await asUser(
      actorId,
      (tx) => tx<{ from_stage: LeadStage; to_stage: LeadStage; changed_by: string | null; reason: string | null; changed_at: Date }[]>`
        select from_stage, to_stage, changed_by, reason, changed_at
        from crm.lead_stage_history where lead_id = ${leadId}
        order by changed_at desc, id desc`,
      this.sql,
    );
    return rows.map((r) => ({ from: r.from_stage, to: r.to_stage, changedBy: r.changed_by, reason: r.reason, changedAt: r.changed_at }));
  }
}
