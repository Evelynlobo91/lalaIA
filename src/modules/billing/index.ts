// API pública do módulo billing (planos, assinaturas e cobrança dos parceiros).
import type { CurrentUser } from "@/modules/identity";
import { getPlan, listPlans, planEntitlements } from "./composition";
import type { PlanFeature } from "./domain/plan";
import { billingActor } from "./features/plans/billing-actor";
import type { PlanFormValues } from "./features/plans/ui/plan-form";

export { PlanForm, type PlanFormValues } from "./features/plans/ui/plan-form";
export { PlanList } from "./features/plans/ui/plan-list";
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
