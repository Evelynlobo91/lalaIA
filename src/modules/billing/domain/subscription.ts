import type { Plan } from "./plan";

export type SubscriptionStatus = "pending" | "active" | "past_due" | "suspended" | "cancelled";
export type InvoiceStatus = "pending" | "paid" | "overdue" | "refunded" | "cancelled";

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  pending: "Aguardando o primeiro pagamento",
  active: "Em dia",
  past_due: "Fatura vencida",
  suspended: "Suspensa por falta de pagamento",
  cancelled: "Cancelada",
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  pending: "Em aberto",
  paid: "Paga",
  overdue: "Vencida",
  refunded: "Estornada",
  cancelled: "Cancelada",
};

/** Dias para pagar uma fatura depois de emitida. */
export const INVOICE_DUE_DAYS = 3;

export type Subscription = {
  id: string;
  ownerId: string;
  /** Plano que vale agora. */
  planId: string;
  /** Troca de plano aguardando pagamento; passa a valer quando a fatura dele for paga. */
  pendingPlanId: string | null;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

export type Invoice = {
  id: string;
  subscriptionId: string;
  planId: string;
  amountCents: number;
  periodStart: Date;
  periodEnd: Date;
  /** "YYYY-MM-DD", calendário de Joinville. */
  dueOn: string;
  status: InvoiceStatus;
  paymentUrl: string;
  paidAt: Date | null;
};

/** O plano assinado vale enquanto a assinatura está em dia ou dentro da carência; senão, vale o padrão. */
export const grantsPlan = (status: SubscriptionStatus) => status === "active" || status === "past_due";

/** Um mês de calendário depois de `from` (31/01 → 28/02 ou 29/02; nunca "pula" um mês). */
export function addOneMonth(from: Date): Date {
  const next = new Date(from);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export type NewInvoice = { planId: string; amountCents: number; periodStart: Date; periodEnd: Date; dueOn: string; gateway: string; gatewayInvoiceId: string; paymentUrl: string };

/** Cobrança no provedor de pagamento (Pix, boleto, cartão). Trocar de provedor é trocar o adaptador (DIP). */
export interface BillingGateway {
  readonly name: string;
  /**
   * Cria a cobrança de uma fatura e devolve o identificador no provedor e o link de pagamento.
   * `reference` é o nosso identificador da cobrança: repetir a chamada com o mesmo valor não cobra duas vezes.
   */
  createCharge(charge: { reference: string; amountCents: number; dueOn: string; description: string; customer: { name: string; email: string } }): Promise<{ gatewayInvoiceId: string; paymentUrl: string }>;
}

/** Nome e e-mail de quem paga, para a cobrança (API pública do módulo identity). */
export interface BillingCustomers {
  find(ownerId: string): Promise<{ name: string; email: string } | null>;
}

/** Assinaturas e faturas. Escrita é do sistema; a leitura "como o usuário" passa pela RLS. */
export interface SubscriptionStore {
  /** Assinatura da conta, com o plano; null se nunca assinou. Sistema (para os direitos por plano). */
  findByOwner(ownerId: string): Promise<(Subscription & { plan: Plan }) | null>;
  /**
   * Cria a assinatura da conta ou atualiza a que existe (uma por conta). Numa transação: cancela as faturas em
   * aberto anteriores (a escolha mudou) e, com `invoice`, grava a nova.
   */
  save(input: {
    ownerId: string;
    planId: string;
    pendingPlanId: string | null;
    status: SubscriptionStatus;
    periodStart: Date | null;
    periodEnd: Date | null;
    invoice: NewInvoice | null;
  }): Promise<{ subscription: Subscription; invoice: Invoice | null }>;
  /** Fatura em aberto (pendente ou vencida) da assinatura, se houver. */
  openInvoice(subscriptionId: string): Promise<Invoice | null>;
  /** Assinaturas ativas cujo ciclo termina até `until` e que ainda não têm a fatura do ciclo seguinte. */
  dueForRenewal(until: Date, limit: number): Promise<Array<Subscription & { plan: Plan }>>;
  /** Grava a fatura do próximo ciclo; null se ela já existia (idempotente por ciclo). */
  addInvoice(subscriptionId: string, invoice: NewInvoice): Promise<Invoice | null>;
}
