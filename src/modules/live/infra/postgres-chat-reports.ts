import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { StreamEntityType } from "../domain/stream";
import type { ChatReportStore, ReportReason, ReportedMessage } from "../features/report-chat-message/report-chat-message.use-case";

const RLS_VIOLATION = "42501";
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";
const codeOf = (error: unknown) => (error as { code?: string }).code;

export class PostgresChatReports implements ChatReportStore {
  constructor(private readonly sql: Sql) {}

  async report(reporterId: string, messageId: string, reason: ReportReason): Promise<"created" | "duplicate" | "unavailable"> {
    try {
      await asUser(reporterId, (tx) => tx`insert into live.chat_reports (message_id, reporter_id, reason) values (${messageId}, ${reporterId}, ${reason})`, this.sql);
      return "created";
    } catch (error) {
      if (codeOf(error) === UNIQUE_VIOLATION) return "duplicate";
      // RLS: mensagem apagada, inexistente ou da própria pessoa.
      if (codeOf(error) === RLS_VIOLATION || codeOf(error) === FK_VIOLATION) return "unavailable";
      throw error;
    }
  }

  async listOpen(actorId: string, limit: number): Promise<ReportedMessage[]> {
    // As denúncias saem sob RLS (só a moderação lê as de todos). O texto da mensagem e a página da live vêm por
    // uma leitura do sistema: quem modera pela plataforma não lê live.streams, e a mensagem já foi pública.
    const reports = await asUser(
      actorId,
      (tx) => tx<{ message_id: string; reports: number; reasons: ReportReason[]; last_report_at: Date }[]>`
        select message_id, count(*)::int as reports, array_agg(distinct reason order by reason) as reasons, max(created_at) as last_report_at
        from live.chat_reports where status = 'open'
        group by message_id order by max(created_at) desc limit ${limit}`,
      this.sql,
    );
    if (reports.length === 0) return [];
    const messages = await this.sql<{ id: string; body: string; user_id: string | null; created_at: Date; entity_type: StreamEntityType; entity_id: string }[]>`
      select m.id, m.body, m.user_id, m.created_at, s.entity_type, s.entity_id
      from live.chat_messages m join live.streams s on s.id = m.stream_id
      where m.id in ${this.sql(reports.map((r) => r.message_id))}`;
    const byId = new Map(messages.map((m) => [m.id, m]));
    return reports.flatMap((r) => {
      const m = byId.get(r.message_id);
      if (!m) return [];
      return [{ messageId: m.id, body: m.body, authorId: m.user_id, createdAt: m.created_at, entityType: m.entity_type, entityId: m.entity_id, reports: r.reports, reasons: r.reasons, lastReportAt: r.last_report_at }];
    });
  }

  async resolve(actorId: string, messageId: string, resolution: "removed" | "kept"): Promise<number> {
    const rows = await asUser(
      actorId,
      (tx) => tx`
        update live.chat_reports set status = 'resolved', resolution = ${resolution}, resolved_by = ${actorId}, resolved_at = now()
        where message_id = ${messageId} and status = 'open' returning id`,
      this.sql,
    );
    return rows.length;
  }
}
