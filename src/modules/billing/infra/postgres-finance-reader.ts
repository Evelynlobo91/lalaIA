import { asUser, type Tx } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { InvoiceStatus, SubscriptionStatus } from "../domain/subscription";
import type { InvoiceLookup, InvoiceToConfirm } from "../features/confirm-payment/confirm-payment.use-case";
import type { Delinquent, FinanceInvoice, FinanceReader, FinanceTotals } from "../features/finance-panel/finance-panel";

const emptyCounts = (): Record<SubscriptionStatus, number> => ({ pending: 0, active: 0, past_due: 0, suspended: 0, cancelled: 0 });

/** Tudo como a pessoa do time (asUser): sem a capacidade billing:read, a RLS devolve tudo vazio. */
export class PostgresFinanceReader implements FinanceReader, InvoiceLookup {
  constructor(private readonly sql: Sql) {}

  private as<T>(actorId: string, fn: (tx: Tx) => Promise<T>) {
    return asUser(actorId, fn, this.sql);
  }

  async find(actorId: string, invoiceId: string): Promise<InvoiceToConfirm | null> {
    const [r] = await this.as(actorId, (tx) => tx<{ id: string; owner_id: string; gateway: string; gateway_invoice_id: string; status: InvoiceStatus }[]>`
      select i.id, s.owner_id, i.gateway, i.gateway_invoice_id, i.status
      from billing.invoices i join billing.subscriptions s on s.id = i.subscription_id
      where i.id = ${invoiceId}`);
    return r ? { id: r.id, ownerId: r.owner_id, gateway: r.gateway, gatewayInvoiceId: r.gateway_invoice_id, status: r.status } : null;
  }

  async totals(actorId: string, since: Date): Promise<FinanceTotals> {
    return this.as(actorId, async (tx) => {
      const [money] = await tx<{ received: number; paid: number; refunded: number; pending: number; overdue: number }[]>`
        select coalesce(sum(amount_cents) filter (where status = 'paid' and paid_at >= ${since}), 0)::int as received,
               count(*) filter (where status = 'paid' and paid_at >= ${since})::int as paid,
               coalesce(sum(amount_cents) filter (where status = 'refunded' and updated_at >= ${since}), 0)::int as refunded,
               coalesce(sum(amount_cents) filter (where status = 'pending'), 0)::int as pending,
               coalesce(sum(amount_cents) filter (where status = 'overdue'), 0)::int as overdue
        from billing.invoices`;
      const byStatus = await tx<{ status: SubscriptionStatus; n: number; mrr: number }[]>`
        select s.status, count(*)::int as n, coalesce(sum(p.price_cents), 0)::int as mrr
        from billing.subscriptions s join billing.plans p on p.id = s.plan_id
        group by s.status`;

      const subscriptions = emptyCounts();
      for (const row of byStatus) subscriptions[row.status] = row.n;
      // MRR: quem está em dia ou na carência (suspensa, cancelada e aguardando o primeiro pagamento não contam).
      const mrrCents = byStatus.filter((r) => r.status === "active" || r.status === "past_due").reduce((sum, r) => sum + r.mrr, 0);
      return { receivedCents: money.received, paidInvoices: money.paid, refundedCents: money.refunded, mrrCents, subscriptions, pendingCents: money.pending, overdueCents: money.overdue };
    });
  }

  async delinquents(actorId: string, limit: number): Promise<Delinquent[]> {
    const rows = await this.as(actorId, (tx) => tx<{ id: string; owner_id: string; plan_name: string; status: "past_due" | "suspended"; overdue: number; oldest: string }[]>`
      select s.id, s.owner_id, p.name as plan_name, s.status, sum(i.amount_cents)::int as overdue, min(i.due_on)::text as oldest
      from billing.subscriptions s
      join billing.plans p on p.id = s.plan_id
      join billing.invoices i on i.subscription_id = s.id and i.status = 'overdue'
      where s.status in ('past_due', 'suspended')
      group by s.id, p.name
      order by min(i.due_on), s.id
      limit ${limit}`);
    return rows.map((r) => ({ subscriptionId: r.id, ownerId: r.owner_id, planName: r.plan_name, status: r.status, overdueCents: r.overdue, oldestDueOn: r.oldest }));
  }

  async invoices(actorId: string, status: InvoiceStatus | undefined, limit: number): Promise<FinanceInvoice[]> {
    const rows = await this.as(actorId, (tx) => tx<{ id: string; owner_id: string; plan_name: string; amount_cents: number; due_on: string; status: InvoiceStatus; paid_at: Date | null }[]>`
      select i.id, s.owner_id, p.name as plan_name, i.amount_cents, i.due_on::text as due_on, i.status, i.paid_at
      from billing.invoices i
      join billing.subscriptions s on s.id = i.subscription_id
      join billing.plans p on p.id = i.plan_id
      where ${status ?? null}::text is null or i.status = ${status ?? null}
      order by i.created_at desc, i.id
      limit ${limit}`);
    return rows.map((r) => ({ id: r.id, ownerId: r.owner_id, planName: r.plan_name, amountCents: r.amount_cents, dueOn: r.due_on, status: r.status, paidAt: r.paid_at }));
  }
}
