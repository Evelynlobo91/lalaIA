// API pública do módulo billing (planos, assinaturas e cobrança dos parceiros).
import type { CurrentUser } from "@/modules/identity";
import "./domain/events";
import { enforceOverdue, getPlan, handlePaymentWebhook, listPlans, planEntitlements, planRepository, renewSubscriptions, subscriptionStore } from "./composition";
import { paymentWebhooksRoute } from "./features/payment-webhooks/payment-webhooks.route";
import { cycleRoute } from "./features/subscribe/cycle.route";
import type { PlanChoice } from "./features/subscribe/ui/plan-picker";
import type { PlanFeature } from "./domain/plan";
import type { SubscriptionStatus } from "./domain/subscription";
import { billingActor } from "./features/plans/billing-actor";
import type { PlanFormValues } from "./features/plans/ui/plan-form";

export { PlanForm, type PlanFormValues } from "./features/plans/ui/plan-form";
export { PlanList } from "./features/plans/ui/plan-list";
export { PlanPicker, type PlanChoice } from "./features/subscribe/ui/plan-picker";
export { SimulatePaymentForm } from "./features/payment-webhooks/ui/simulate-payment-form";
export { subscriptionStatusLabels, type SubscriptionStatus } from "./domain/subscription";
export { featureLabel, formatPlanPrice, planFeatures, type Plan, type PlanFeature } from "./domain/plan";

type Viewer = Pick<CurrentUser, "id" | "roles">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Direitos por plano (#152): "este parceiro tem direito a live?". É por aqui que os outros módulos (live,
 * discovery...) perguntam, sem conhecer as tabelas de cobrança. `ownerId` é a conta do parceiro.
 */
export function hasPlanFeature(ownerId: string, feature: PlanFeature): Promise<boolean> {
  return planEntitlements().has(ownerId, feature);
}

/** Todos os recursos liberados para o parceiro. */
export function planFeaturesOf(ownerId: string): Promise<PlanFeature[]> {
  return planEntitlements().featuresOf(ownerId);
}

/** Planos para o backoffice (quem tem `billing:read`). */
export function plansFor(viewer: Viewer) {
  return listPlans().execute(billingActor(viewer));
}

/** Plano para o formulário de edição; null se não existir ou a pessoa não tiver acesso. */
export async function editablePlan(viewer: Viewer, planId: string): Promise<{ name: string; values: PlanFormValues } | null> {
  if (!UUID.test(planId)) return null;
  const result = await getPlan().execute(billingActor(viewer), planId);
  if (!result.ok) return null;
  const plan = result.value;
  return {
    name: plan.name,
    values: {
      planId: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      price: plan.priceCents === 0 ? "" : (plan.priceCents / 100).toFixed(2).replace(".", ","),
      features: plan.features,
      isDefault: plan.isDefault,
      active: plan.active,
    },
  };
}

/**
 * O que o parceiro vê em /parceiro/assinatura (#153): os planos ativos, qual vale agora e qual aguarda pagamento.
 * `ownerId` vem sempre da sessão.
 */
export async function subscriptionOverview(ownerId: string): Promise<{ status: SubscriptionStatus | null; plans: PlanChoice[] }> {
  const [plans, subscription, fallback] = await Promise.all([subscriptionStore().listActive(), subscriptionStore().findByOwner(ownerId), planRepository().defaultPlan()]);
  // Sem assinatura (ou com ela cancelada/suspensa/aguardando), o que vale é o plano padrão.
  const effective = subscription && (subscription.status === "active" || subscription.status === "past_due") ? subscription.planId : fallback?.id;
  const pending = subscription && subscription.status !== "cancelled" ? (subscription.pendingPlanId ?? (subscription.status === "pending" ? subscription.planId : null)) : null;
  return {
    status: subscription?.status ?? null,
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents,
      features: plan.features,
      state: plan.id === pending ? "pending" : plan.id === effective ? "current" : "available",
    })),
  };
}

/**
 * - POST /api/billing/cycle: ciclo diário (faturas do próximo ciclo, vencidas e suspensão). Protegido por segredo.
 * - POST /api/billing/webhooks: eventos de pagamento do provedor, com assinatura verificada.
 * Veja docs/billing.md.
 */
export const billingApi = {
  cycle: cycleRoute({ renew: () => renewSubscriptions(), overdue: () => enforceOverdue() }, () => process.env.CRON_SECRET),
  webhooks: paymentWebhooksRoute(() => handlePaymentWebhook()),
};

/** O simulador de pagamento está ligado neste ambiente? (só com o provedor simulado e o segredo configurado) */
export const paymentSimulatorEnabled = () => handlePaymentWebhook() !== null;
