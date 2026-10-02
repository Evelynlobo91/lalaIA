import { z } from "zod";
import { ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { BillingActor } from "../../domain/plan";
import type { InvoiceStatus, SubscriptionStatus } from "../../domain/subscription";

export const financePeriods = [30, 90, 365] as const;
export type FinancePeriod = (typeof financePeriods)[number];
const invoiceStatuses = ["pending", "paid", "overdue", "refunded", "cancelled"] as const satisfies readonly InvoiceStatus[];

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Filtros de /admin/financeiro, a partir da URL. Valor inválido cai no padrão (30 dias, todas as faturas). */
export const financeFilterSchema = z.object({
  periodo: z.preprocess(first, z.coerce.number().refine((v) => (financePeriods as readonly number[]).includes(v)).catch(30)),
  faturas: z.preprocess(
    first,
    z
      .string()
      .refine((v) => (invoiceStatuses as readonly string[]).includes(v))
      .optional()
      .catch(undefined),
  ),
});

export type FinanceTotals = {
  /** Recebido no período: soma das faturas pagas (centavos) e quantas foram. */
  receivedCents: number;
  paidInvoices: number;
  /** Estornado no período (centavos). */
  refundedCents: number;
  /** Receita mensal recorrente: soma da mensalidade das assinaturas em dia ou na carência. */
  mrrCents: number;
  /** Assinaturas por situação. */
  subscriptions: Record<SubscriptionStatus, number>;
  /** Em aberto e vencido hoje (centavos). */
  pendingCents: number;
  overdueCents: number;
};

export type Delinquent = { subscriptionId: string; ownerId: string; planName: string; status: "past_due" | "suspended"; overdueCents: number; oldestDueOn: string };
export type FinanceInvoice = { id: string; ownerId: string; planName: string; amountCents: number; dueOn: string; status: InvoiceStatus; paidAt: Date | null };

/** Leitura do financeiro "como a pessoa do time" (RLS por capacidade: só quem tem billing:read). */
export interface FinanceReader {
  totals(actorId: string, since: Date): Promise<FinanceTotals>;
  /** Assinaturas na carência ou suspensas com fatura vencida, as dívidas mais antigas primeiro. */
  delinquents(actorId: string, limit: number): Promise<Delinquent[]>;
  /** Faturas mais recentes, opcionalmente por situação. */
  invoices(actorId: string, status: InvoiceStatus | undefined, limit: number): Promise<FinanceInvoice[]>;
}

export type FinancePanelView = {
  period: FinancePeriod;
  invoiceStatus: InvoiceStatus | undefined;
  totals: FinanceTotals;
  delinquents: Array<Delinquent & { ownerName: string; ownerEmail: string }>;
  invoices: Array<FinanceInvoice & { ownerName: string }>;
};

export const FINANCE_LIST_LIMIT = 50;
const DAY_MS = 86_400_000;

/** Painel financeiro (#156): recebimentos, MRR, inadimplentes e faturas por situação. */
export class GetFinancePanel {
  constructor(
    private readonly reader: FinanceReader,
    private readonly owners: (ids: string[]) => Promise<Map<string, { name: string; email: string }>>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: BillingActor, params: Record<string, unknown>): Promise<Result<FinancePanelView, DomainError>> {
    if (!actor.canRead) return err(new ForbiddenError());
    const filter = financeFilterSchema.parse(params);
    const period = filter.periodo as FinancePeriod;
    const invoiceStatus = filter.faturas as InvoiceStatus | undefined;
    const since = new Date(this.now().getTime() - period * DAY_MS);

    const [totals, delinquents, invoices] = await Promise.all([
      this.reader.totals(actor.id, since),
      this.reader.delinquents(actor.id, FINANCE_LIST_LIMIT),
      this.reader.invoices(actor.id, invoiceStatus, FINANCE_LIST_LIMIT),
    ]);
    const owners = await this.owners([...new Set([...delinquents, ...invoices].map((row) => row.ownerId))]);
    const nameOf = (id: string) => owners.get(id)?.name ?? "Conta removida";

    return ok({
      period,
      invoiceStatus,
      totals,
      delinquents: delinquents.map((d) => ({ ...d, ownerName: nameOf(d.ownerId), ownerEmail: owners.get(d.ownerId)?.email ?? "—" })),
      invoices: invoices.map((i) => ({ ...i, ownerName: nameOf(i.ownerId) })),
    });
  }
}
