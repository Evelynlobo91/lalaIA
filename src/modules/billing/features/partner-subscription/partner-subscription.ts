import type { Plan } from "../../domain/plan";
import { grantsPlan, type Invoice, type Subscription, type SubscriptionStatus } from "../../domain/subscription";

/** Fatura na tela do parceiro: com o nome do plano e se ainda dá para pagar. */
export type InvoiceView = Pick<Invoice, "id" | "amountCents" | "dueOn" | "status" | "paidAt"> & {
  planName: string;
  /** Link de pagamento (segunda via) enquanto a fatura está em aberto ou vencida; null depois. */
  paymentUrl: string | null;
};

export type MySubscriptionView = {
  /** Situação da assinatura; null se a conta nunca assinou. */
  status: SubscriptionStatus | null;
  /** Plano que vale agora (o assinado, se em dia ou na carência; senão o padrão). */
  currentPlan: Pick<Plan, "id" | "name" | "priceCents" | "features"> | null;
  /** Fim do ciclo vigente (quando a próxima fatura vence), se houver ciclo pago. */
  renewsAt: Date | null;
  /** Plano escolhido que ainda aguarda pagamento. */
  pendingPlanName: string | null;
  invoices: InvoiceView[];
};

/** Leitura "como o parceiro": a RLS garante que cada conta só vê a própria assinatura e as próprias faturas. */
export interface MySubscriptionReader {
  subscription(ownerId: string): Promise<Subscription | null>;
  /** Faturas da conta, da mais recente para a mais antiga, com o nome do plano (null se o plano saiu do catálogo). */
  invoices(ownerId: string, limit: number): Promise<Array<Invoice & { planName: string | null }>>;
}

/** Catálogo, sem RLS: nome dos planos e o plano padrão. */
export interface PlanNames {
  byId(planId: string): Promise<Plan | null>;
  defaultPlan(): Promise<Plan | null>;
}

export const INVOICES_LIMIT = 24;

/** Assinatura do parceiro (#155): plano atual, próxima renovação, troca pendente e faturas com segunda via. */
export class GetMySubscription {
  constructor(
    private readonly reader: MySubscriptionReader,
    private readonly plans: PlanNames,
  ) {}

  async execute(ownerId: string): Promise<MySubscriptionView> {
    const [subscription, invoices] = await Promise.all([this.reader.subscription(ownerId), this.reader.invoices(ownerId, INVOICES_LIMIT)]);
    const effective = subscription && grantsPlan(subscription.status);
    const current = effective ? await this.plans.byId(subscription.planId) : await this.plans.defaultPlan();
    // Aguardando pagamento: a troca pendente ou, na primeira assinatura, o próprio plano escolhido.
    const pendingId = subscription && subscription.status !== "cancelled" ? (subscription.pendingPlanId ?? (subscription.status === "pending" ? subscription.planId : null)) : null;
    const pending = pendingId ? await this.plans.byId(pendingId) : null;

    return {
      status: subscription?.status ?? null,
      currentPlan: current ? { id: current.id, name: current.name, priceCents: current.priceCents, features: current.features } : null,
      renewsAt: effective && current && current.priceCents > 0 ? subscription.currentPeriodEnd : null,
      pendingPlanName: pending?.name ?? null,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        amountCents: invoice.amountCents,
        dueOn: invoice.dueOn,
        status: invoice.status,
        paidAt: invoice.paidAt,
        planName: invoice.planName ?? "Plano fora do catálogo",
        paymentUrl: invoice.status === "pending" || invoice.status === "overdue" ? invoice.paymentUrl : null,
      })),
    };
  }
}
