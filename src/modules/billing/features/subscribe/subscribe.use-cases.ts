import { z } from "zod";
import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { formatPlanPrice, type Plan } from "../../domain/plan";
import { INVOICE_DUE_DAYS, addOneMonth, grantsPlan, type BillingCustomers, type BillingGateway, type Invoice, type NewInvoice, type Subscription, type SubscriptionStore } from "../../domain/subscription";
import type { PlanResolver } from "../plans/plans.use-cases";

export const subscribeSchema = z.object({ planId: z.uuid() });

/** Quem assina: a conta do parceiro (id da sessão) e se ela é parceira aprovada. */
export type Subscriber = { id: string; isPartner: boolean };

/** Planos que o parceiro pode assinar (ativos), sem RLS: o catálogo é mostrado a qualquer parceiro. */
export interface ActivePlans {
  findActive(planId: string): Promise<Plan | null>;
  listActive(): Promise<Plan[]>;
}

const DAY_MS = 86_400_000;

/** Monta a cobrança de um ciclo no provedor e devolve a fatura a gravar. */
async function chargeFor(
  gateway: BillingGateway,
  customers: BillingCustomers,
  input: { ownerId: string; subscriptionRef: string; plan: Plan; periodStart: Date; periodEnd: Date; dueOn: string },
): Promise<Result<NewInvoice, DomainError>> {
  const customer = await customers.find(input.ownerId);
  if (!customer) return err(new NotFoundError("Conta do parceiro"));
  const charge = await gateway.createCharge({
    // Mesmo plano e mesmo ciclo → mesma referência: repetir a renovação não gera uma segunda cobrança no provedor.
    reference: `${input.subscriptionRef}:${input.plan.id}:${input.periodStart.toISOString()}`,
    amountCents: input.plan.priceCents,
    dueOn: input.dueOn,
    description: `LalaIA · Plano ${input.plan.name} (${formatPlanPrice(input.plan.priceCents)})`,
    customer,
  });
  return ok({
    planId: input.plan.id,
    amountCents: input.plan.priceCents,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    dueOn: input.dueOn,
    gateway: gateway.name,
    gatewayInvoiceId: charge.gatewayInvoiceId,
    paymentUrl: charge.paymentUrl,
  });
}

export type Subscribed = { subscription: Subscription; invoice: Invoice | null; plan: Plan };

/**
 * O parceiro assina um plano (#153). Plano gratuito vale na hora; plano pago gera a primeira fatura com o link
 * de pagamento, e a assinatura fica aguardando o pagamento (os recursos pagos só valem depois dele, #154).
 */
export class Subscribe {
  constructor(
    private readonly plans: Pick<ActivePlans, "findActive">,
    private readonly subscriptions: Pick<SubscriptionStore, "findByOwner" | "save" | "openInvoice">,
    private readonly gateway: () => BillingGateway,
    private readonly customers: BillingCustomers,
    private readonly now: () => Date,
    private readonly dayOf: (date: Date) => string,
  ) {}

  async execute(subscriber: Subscriber, planId: string): Promise<Result<Subscribed, DomainError>> {
    if (!subscriber.isPartner) return err(new ForbiddenError("Só parceiros aprovados assinam um plano."));
    const plan = await this.plans.findActive(planId);
    if (!plan) return err(new NotFoundError("Plano"));

    const current = await this.subscriptions.findByOwner(subscriber.id);
    if (current?.status === "suspended") {
      return err(new BusinessRuleError("subscription_suspended", "Sua assinatura está suspensa por falta de pagamento. Pague a fatura em aberto para voltar."));
    }
    const effective = current && grantsPlan(current.status) ? current : null;
    const chosen = current && current.status !== "cancelled" ? (current.pendingPlanId ?? current.planId) : null;
    if (current && chosen === plan.id) {
      // Mesma escolha de novo: devolve o que já existe (com a fatura em aberto, se houver), sem cobrar outra vez.
      return ok({ subscription: current, invoice: await this.subscriptions.openInvoice(current.id), plan });
    }
    if (effective && effective.planId === plan.id) {
      // Voltou para o plano que já vale: desfaz a troca que aguardava pagamento, sem nova cobrança.
      const saved = await this.subscriptions.save({
        ownerId: subscriber.id,
        planId: effective.planId,
        pendingPlanId: null,
        status: effective.status,
        periodStart: effective.currentPeriodStart,
        periodEnd: effective.currentPeriodEnd,
        invoice: null,
      });
      return ok({ ...saved, plan });
    }

    const start = this.now();
    if (plan.priceCents === 0) {
      // Plano gratuito vale na hora (e desfaz uma troca que estivesse aguardando pagamento).
      const saved = await this.subscriptions.save({ ownerId: subscriber.id, planId: plan.id, pendingPlanId: null, status: "active", periodStart: start, periodEnd: addOneMonth(start), invoice: null });
      return ok({ ...saved, plan });
    }

    const periodEnd = addOneMonth(start);
    const invoice = await chargeFor(this.gateway(), this.customers, {
      ownerId: subscriber.id,
      subscriptionRef: subscriber.id,
      plan,
      periodStart: start,
      periodEnd,
      dueOn: this.dayOf(new Date(start.getTime() + INVOICE_DUE_DAYS * DAY_MS)),
    });
    if (!invoice.ok) return invoice;

    // Quem já tem um plano valendo continua com ele até pagar o novo (a troca fica pendente);
    // quem não tem fica aguardando o primeiro pagamento.
    const saved = effective
      ? await this.subscriptions.save({
          ownerId: subscriber.id,
          planId: effective.planId,
          pendingPlanId: effective.planId === plan.id ? null : plan.id,
          status: effective.status,
          periodStart: effective.currentPeriodStart,
          periodEnd: effective.currentPeriodEnd,
          invoice: invoice.value,
        })
      : await this.subscriptions.save({ ownerId: subscriber.id, planId: plan.id, pendingPlanId: null, status: "pending", periodStart: null, periodEnd: null, invoice: invoice.value });
    return ok({ ...saved, plan });
  }
}

/** Com quantos dias de antecedência a fatura do próximo ciclo é emitida. */
export const RENEWAL_LEAD_DAYS = 5;

/**
 * Ciclo mensal (#153): emite a fatura do próximo ciclo das assinaturas em dia que estão para vencer.
 * Roda por agendamento (uma vez por dia); é idempotente por ciclo.
 */
export class RenewSubscriptions {
  constructor(
    private readonly subscriptions: Pick<SubscriptionStore, "dueForRenewal" | "addInvoice">,
    private readonly gateway: () => BillingGateway,
    private readonly customers: BillingCustomers,
    private readonly now: () => Date,
    private readonly dayOf: (date: Date) => string,
  ) {}

  async execute(limit = 200): Promise<{ invoiced: number; skipped: number; failed: number }> {
    const until = new Date(this.now().getTime() + RENEWAL_LEAD_DAYS * DAY_MS);
    const due = await this.subscriptions.dueForRenewal(until, limit);
    const report = { invoiced: 0, skipped: 0, failed: 0 };

    for (const subscription of due) {
      // Plano que virou gratuito ou foi desativado: nada a cobrar.
      if (subscription.plan.priceCents === 0 || !subscription.currentPeriodEnd) {
        report.skipped++;
        continue;
      }
      const periodStart = subscription.currentPeriodEnd;
      const invoice = await chargeFor(this.gateway(), this.customers, {
        ownerId: subscription.ownerId,
        subscriptionRef: subscription.ownerId,
        plan: subscription.plan,
        periodStart,
        periodEnd: addOneMonth(periodStart),
        // Vence no dia em que o ciclo atual termina.
        dueOn: this.dayOf(periodStart),
      }).catch(() => null);
      if (!invoice?.ok) {
        // Uma cobrança que falha não trava as outras; a próxima execução tenta de novo.
        report.failed++;
        continue;
      }
      if (await this.subscriptions.addInvoice(subscription.id, invoice.value)) report.invoiced++;
      else report.skipped++;
    }
    return report;
  }
}

/** Plano que vale para um dono de conteúdo: o assinado, se a assinatura estiver em dia ou na carência; senão o padrão. */
export const subscriptionPlanResolver =
  (subscriptions: Pick<SubscriptionStore, "findByOwner">, fallback: PlanResolver): PlanResolver =>
  async (ownerId) => {
    const subscription = await subscriptions.findByOwner(ownerId);
    return subscription && grantsPlan(subscription.status) ? subscription.plan : fallback(ownerId);
  };
