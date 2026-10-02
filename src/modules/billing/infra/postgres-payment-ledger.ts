import type { Sql } from "@/shared/db/sql";
import type { AppliedEvent, PaymentEvent, PaymentLedger, SubscriptionChange } from "../domain/payment";
import type { SubscriptionStatus } from "../domain/subscription";

type InvoiceLock = { id: string; subscription_id: string; plan_id: string; status: string; period_start: Date; period_end: Date };
type SubscriptionLock = { id: string; owner_id: string; status: SubscriptionStatus; plan_id: string; pending_plan_id: string | null };

const change = (s: SubscriptionLock, to: SubscriptionStatus): SubscriptionChange | null => (s.status === to ? null : { subscriptionId: s.id, ownerId: s.owner_id, from: s.status, to });

/** Pagamentos aplicados pelo sistema (sem asUser): quem escreve aqui é o webhook autenticado e o ciclo diário. */
export class PostgresPaymentLedger implements PaymentLedger {
  constructor(private readonly sql: Sql) {}

  async apply(gateway: string, event: PaymentEvent): Promise<AppliedEvent> {
    return this.sql.begin(async (tx): Promise<AppliedEvent> => {
      // Trava a fatura: dois webhooks da mesma cobrança não se atropelam.
      const [invoice] = await tx<InvoiceLock[]>`
        select id, subscription_id, plan_id, status, period_start, period_end
        from billing.invoices where gateway = ${gateway} and gateway_invoice_id = ${event.gatewayInvoiceId} for update`;

      const record = (outcome: "applied" | "ignored" | "unknown_invoice") => tx`
        insert into billing.payment_events (gateway, gateway_event_id, kind, gateway_invoice_id, invoice_id, outcome, occurred_at)
        values (${gateway}, ${event.eventId}, ${event.kind}, ${event.gatewayInvoiceId}, ${invoice?.id ?? null}, ${outcome}, ${event.occurredAt})
        on conflict (gateway, gateway_event_id) do nothing
        returning id`;

      if (!invoice) {
        const inserted = await record("unknown_invoice");
        return { outcome: inserted.length ? "unknown_invoice" : "duplicate", change: null };
      }

      const [subscription] = await tx<SubscriptionLock[]>`select id, owner_id, status, plan_id, pending_plan_id from billing.subscriptions where id = ${invoice.subscription_id} for update`;

      // O que este evento faria, considerando a situação atual da fatura.
      const applies =
        (event.kind === "paid" && (invoice.status === "pending" || invoice.status === "overdue")) ||
        (event.kind === "overdue" && invoice.status === "pending") ||
        (event.kind === "refunded" && invoice.status === "paid");

      const inserted = await record(applies ? "applied" : "ignored");
      if (inserted.length === 0) return { outcome: "duplicate", change: null };
      if (!applies) return { outcome: "ignored", change: null };

      if (event.kind === "paid") {
        await tx`update billing.invoices set status = 'paid', paid_at = ${event.occurredAt} where id = ${invoice.id}`;
        // O plano da fatura passa a valer (primeira assinatura, troca pendente ou renovação) e o ciclo é o da fatura.
        await tx`
          update billing.subscriptions
          set status = 'active', plan_id = ${invoice.plan_id}, pending_plan_id = null,
              current_period_start = ${invoice.period_start}, current_period_end = ${invoice.period_end}, cancelled_at = null
          where id = ${subscription.id}`;
        return { outcome: "applied", change: change(subscription, "active") };
      }

      if (event.kind === "overdue") {
        await tx`update billing.invoices set status = 'overdue' where id = ${invoice.id}`;
        // Só quem estava em dia e deve a renovação do plano que vale entra na carência; troca pendente não derruba nada.
        if (subscription.status === "active" && invoice.plan_id === subscription.plan_id) {
          await tx`update billing.subscriptions set status = 'past_due' where id = ${subscription.id}`;
          return { outcome: "applied", change: change(subscription, "past_due") };
        }
        return { outcome: "applied", change: null };
      }

      // Estorno: o pagamento foi desfeito, então os recursos pagos saem na hora.
      await tx`update billing.invoices set status = 'refunded' where id = ${invoice.id}`;
      if (subscription.status === "active" || subscription.status === "past_due") {
        await tx`update billing.subscriptions set status = 'suspended' where id = ${subscription.id}`;
        return { outcome: "applied", change: change(subscription, "suspended") };
      }
      return { outcome: "applied", change: null };
    }) as Promise<AppliedEvent>;
  }

  async markOverdue(today: string): Promise<SubscriptionChange[]> {
    return this.sql.begin(async (tx) => {
      const invoices = await tx<{ subscription_id: string; plan_id: string }[]>`
        update billing.invoices set status = 'overdue' where status = 'pending' and due_on < ${today}::date returning subscription_id, plan_id`;
      if (invoices.length === 0) return [];
      const rows = await tx<{ id: string; owner_id: string }[]>`
        update billing.subscriptions s set status = 'past_due'
        where s.status = 'active'
          and exists (select 1 from billing.invoices i where i.subscription_id = s.id and i.status = 'overdue' and i.plan_id = s.plan_id)
        returning s.id, s.owner_id`;
      return rows.map((r) => ({ subscriptionId: r.id, ownerId: r.owner_id, from: "active" as const, to: "past_due" as const }));
    }) as Promise<SubscriptionChange[]>;
  }

  async suspendOverdue(limit: string): Promise<SubscriptionChange[]> {
    const rows = await this.sql<{ id: string; owner_id: string }[]>`
      update billing.subscriptions s set status = 'suspended'
      where s.status = 'past_due'
        and exists (select 1 from billing.invoices i where i.subscription_id = s.id and i.status = 'overdue' and i.plan_id = s.plan_id and i.due_on < ${limit}::date)
      returning s.id, s.owner_id`;
    return rows.map((r) => ({ subscriptionId: r.id, ownerId: r.owner_id, from: "past_due" as const, to: "suspended" as const }));
  }
}
