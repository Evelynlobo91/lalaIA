import type postgres from "postgres";
import type { Sql } from "@/shared/db/sql";
import type { Plan } from "../domain/plan";
import type { Invoice, InvoiceStatus, NewInvoice, Subscription, SubscriptionStatus, SubscriptionStore } from "../domain/subscription";
import type { ActivePlans } from "../features/subscribe/subscribe.use-cases";
import { PLAN_COLUMNS, toPlan, type PlanRow } from "./postgres-plan-repository";

type SubscriptionRow = { id: string; owner_id: string; plan_id: string; pending_plan_id: string | null; status: SubscriptionStatus; current_period_start: Date | null; current_period_end: Date | null };
type InvoiceRow = {
  id: string;
  subscription_id: string;
  plan_id: string;
  amount_cents: number;
  period_start: Date;
  period_end: Date;
  due_on: string;
  status: InvoiceStatus;
  payment_url: string;
  paid_at: Date | null;
};

const SUBSCRIPTION_COLUMNS = "s.id, s.owner_id, s.plan_id, s.pending_plan_id, s.status, s.current_period_start, s.current_period_end";
// `due_on::text`: a data vem como "YYYY-MM-DD", sem virar Date (que traria fuso junto).
export const INVOICE_COLUMNS = "i.id, i.subscription_id, i.plan_id, i.amount_cents, i.period_start, i.period_end, i.due_on::text as due_on, i.status, i.payment_url, i.paid_at";
const PLAN_AS_P = PLAN_COLUMNS.split(", ")
  .map((c) => `p.${c} as p_${c}`)
  .join(", ");

export const toSubscription = (r: SubscriptionRow): Subscription => ({
  id: r.id,
  ownerId: r.owner_id,
  planId: r.plan_id,
  pendingPlanId: r.pending_plan_id,
  status: r.status,
  currentPeriodStart: r.current_period_start,
  currentPeriodEnd: r.current_period_end,
});

export const toInvoice = (r: InvoiceRow): Invoice => ({
  id: r.id,
  subscriptionId: r.subscription_id,
  planId: r.plan_id,
  amountCents: r.amount_cents,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  dueOn: r.due_on,
  status: r.status,
  paymentUrl: r.payment_url,
  paidAt: r.paid_at,
});

export type { InvoiceRow, SubscriptionRow };

/** Linha com as colunas do plano prefixadas (`p_`) → plano. */
const planFrom = (row: Record<string, unknown>): Plan => toPlan(Object.fromEntries(PLAN_COLUMNS.split(", ").map((c) => [c, row[`p_${c}`]])) as PlanRow);

const insertInvoice = (tx: postgres.TransactionSql | Sql, subscriptionId: string, i: NewInvoice) =>
  tx.unsafe<InvoiceRow[]>(
    `insert into billing.invoices as i (subscription_id, plan_id, amount_cents, period_start, period_end, due_on, gateway, gateway_invoice_id, payment_url)
     values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9)
     on conflict (subscription_id, period_start) do nothing
     returning ${INVOICE_COLUMNS}`,
    [subscriptionId, i.planId, i.amountCents, i.periodStart, i.periodEnd, i.dueOn, i.gateway, i.gatewayInvoiceId, i.paymentUrl],
  );

/**
 * Assinaturas e faturas, gravadas pelo sistema (sem asUser): quem assina é o parceiro, mas ele não pode
 * escrever direto nas tabelas de cobrança. A autorização fica nos casos de uso.
 */
export class PostgresSubscriptionStore implements SubscriptionStore, ActivePlans {
  constructor(private readonly sql: Sql) {}

  async findActive(planId: string): Promise<Plan | null> {
    const [row] = await this.sql.unsafe<PlanRow[]>(`select ${PLAN_COLUMNS} from billing.plans where id = $1 and active`, [planId]);
    return row ? toPlan(row) : null;
  }

  async listActive(): Promise<Plan[]> {
    const rows = await this.sql.unsafe<PlanRow[]>(`select ${PLAN_COLUMNS} from billing.plans where active order by price_cents, name`);
    return rows.map(toPlan);
  }

  async findByOwner(ownerId: string): Promise<(Subscription & { plan: Plan }) | null> {
    const [row] = await this.sql.unsafe<Array<SubscriptionRow & Record<string, unknown>>>(
      `select ${SUBSCRIPTION_COLUMNS}, ${PLAN_AS_P} from billing.subscriptions s join billing.plans p on p.id = s.plan_id where s.owner_id = $1`,
      [ownerId],
    );
    return row ? { ...toSubscription(row), plan: planFrom(row) } : null;
  }

  async save(input: Parameters<SubscriptionStore["save"]>[0]): Promise<{ subscription: Subscription; invoice: Invoice | null }> {
    return this.sql.begin(async (tx) => {
      const [row] = await tx.unsafe<SubscriptionRow[]>(
        `insert into billing.subscriptions as s (owner_id, plan_id, pending_plan_id, status, current_period_start, current_period_end)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (owner_id) do update set plan_id = excluded.plan_id, pending_plan_id = excluded.pending_plan_id, status = excluded.status,
           current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end, cancelled_at = null
         returning ${SUBSCRIPTION_COLUMNS}`,
        [input.ownerId, input.planId, input.pendingPlanId, input.status, input.periodStart, input.periodEnd],
      );
      // A escolha mudou: faturas em aberto de planos que não são nem o que vale nem o novo pendente deixam de valer.
      await tx`
        update billing.invoices set status = 'cancelled'
        where subscription_id = ${row.id} and status in ('pending', 'overdue')
          and plan_id <> ${input.planId} and plan_id is distinct from ${input.pendingPlanId}`;
      const [invoice] = input.invoice ? await insertInvoice(tx, row.id, input.invoice) : [];
      return { subscription: toSubscription(row), invoice: invoice ? toInvoice(invoice) : null };
    }) as Promise<{ subscription: Subscription; invoice: Invoice | null }>;
  }

  async openInvoice(subscriptionId: string): Promise<Invoice | null> {
    const [row] = await this.sql.unsafe<InvoiceRow[]>(
      `select ${INVOICE_COLUMNS} from billing.invoices i where i.subscription_id = $1 and i.status in ('pending', 'overdue') order by i.created_at desc limit 1`,
      [subscriptionId],
    );
    return row ? toInvoice(row) : null;
  }

  /** Fatura da assinatura pelo id da cobrança no provedor (o simulador só paga cobranças do próprio dono). */
  async findInvoiceByGatewayId(subscriptionId: string, gatewayInvoiceId: string): Promise<Invoice | null> {
    const [row] = await this.sql.unsafe<InvoiceRow[]>(`select ${INVOICE_COLUMNS} from billing.invoices i where i.subscription_id = $1 and i.gateway_invoice_id = $2`, [subscriptionId, gatewayInvoiceId]);
    return row ? toInvoice(row) : null;
  }

  async dueForRenewal(until: Date, limit: number): Promise<Array<Subscription & { plan: Plan }>> {
    const rows = await this.sql.unsafe<Array<SubscriptionRow & Record<string, unknown>>>(
      `select ${SUBSCRIPTION_COLUMNS}, ${PLAN_AS_P}
       from billing.subscriptions s join billing.plans p on p.id = s.plan_id
       where s.status = 'active' and s.current_period_end <= $1
         and not exists (select 1 from billing.invoices i where i.subscription_id = s.id and i.period_start = s.current_period_end)
       order by s.current_period_end
       limit $2`,
      [until, limit],
    );
    return rows.map((row) => ({ ...toSubscription(row), plan: planFrom(row) }));
  }

  async addInvoice(subscriptionId: string, invoice: NewInvoice): Promise<Invoice | null> {
    const [row] = await insertInvoice(this.sql, subscriptionId, invoice);
    return row ? toInvoice(row) : null;
  }
}
