import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { NewXpTransaction, XpLedger, XpReason, XpTransaction } from "../domain/xp";

type Row = { id: string; user_id: string; amount: number; reason: XpReason; source_id: string; description: string; created_at: Date };

/**
 * Livro-razão de XP. Escrita só pelo backend (assinatura de eventos), com `on conflict do nothing`
 * sobre os unique de evento e de origem; leituras como o próprio usuário (asUser + RLS).
 */
export class PostgresXpLedger implements XpLedger {
  constructor(private readonly sql: Sql) {}

  async append(e: NewXpTransaction): Promise<boolean> {
    const rows = await this.sql`
      insert into progression.xp_transactions (user_id, amount, reason, source_id, description, event_id)
      values (${e.userId}, ${e.amount}, ${e.reason}, ${e.sourceId}, ${e.description}, ${e.eventId})
      on conflict do nothing
      returning id`;
    return rows.length > 0;
  }

  async balanceOf(userId: string): Promise<number> {
    const [row] = await asUser(userId, (tx) => tx<{ xp: number }[]>`select xp from progression.xp_balances where user_id = ${userId}`, this.sql);
    return row?.xp ?? 0;
  }

  async history(userId: string, limit: number): Promise<XpTransaction[]> {
    const rows = await asUser(
      userId,
      (tx) => tx<Row[]>`
        select id, user_id, amount, reason, source_id, description, created_at from progression.xp_transactions
        where user_id = ${userId} order by created_at desc, id limit ${limit}`,
      this.sql,
    );
    return rows.map((r) => ({ id: r.id, userId: r.user_id, amount: r.amount, reason: r.reason, sourceId: r.source_id, description: r.description, createdAt: r.created_at }));
  }
}
