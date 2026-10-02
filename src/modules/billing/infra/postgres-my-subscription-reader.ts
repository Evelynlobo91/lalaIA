import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { Invoice, Subscription } from "../domain/subscription";
import type { MySubscriptionReader } from "../features/partner-subscription/partner-subscription";
import { INVOICE_COLUMNS, toInvoice, toSubscription, type InvoiceRow, type SubscriptionRow } from "./postgres-subscription-store";

/**
 * Leitura da assinatura e das faturas como o próprio parceiro (asUser): mesmo que a consulta esquecesse o
 * filtro por dono, a RLS não deixaria uma conta ver as faturas de outra.
 */
export class PostgresMySubscriptionReader implements MySubscriptionReader {
  constructor(private readonly sql: Sql) {}

  async subscription(ownerId: string): Promise<Subscription | null> {
    const [row] = await asUser(
      ownerId,
      (tx) => tx<SubscriptionRow[]>`select id, owner_id, plan_id, pending_plan_id, status, current_period_start, current_period_end from billing.subscriptions where owner_id = ${ownerId}`,
      this.sql,
    );
    return row ? toSubscription(row) : null;
  }

  async invoices(ownerId: string, limit: number): Promise<Array<Invoice & { planName: string | null }>> {
    const rows = await asUser(
      ownerId,
      (tx) =>
        tx.unsafe<Array<InvoiceRow & { plan_name: string | null }>>(
          // `left join`: plano desativado some do catálogo visível ao parceiro, mas a fatura continua aparecendo.
          `select ${INVOICE_COLUMNS}, p.name as plan_name
           from billing.invoices i
           join billing.subscriptions s on s.id = i.subscription_id
           left join billing.plans p on p.id = i.plan_id
           where s.owner_id = $1
           order by i.created_at desc, i.id
           limit $2`,
          [ownerId, limit],
        ),
      this.sql,
    );
    return rows.map((row) => ({ ...toInvoice(row), planName: row.plan_name }));
  }
}
