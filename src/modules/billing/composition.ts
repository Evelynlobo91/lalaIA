// Composição do módulo billing (interna): usada pelas actions e pelo index.ts.
import { usersByIds } from "@/modules/identity";
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { lazy } from "@/shared/kernel";
import { localDate } from "@/shared/time/joinville-time";
import type { BillingCustomers } from "./domain/subscription";
import { GetPlan, ListPlans, PlanEntitlements, SavePlan, defaultPlanResolver } from "./features/plans/plans.use-cases";
import { RenewSubscriptions, Subscribe, subscriptionPlanResolver } from "./features/subscribe/subscribe.use-cases";
import { EnforceOverdue, HandlePaymentWebhook } from "./features/payment-webhooks/payment-webhooks.use-cases";
import { billingGatewayFrom, graceDaysFrom, paymentWebhooksFrom } from "./infra/billing-config";
import { PostgresPaymentLedger } from "./infra/postgres-payment-ledger";
import { PostgresPlanRepository } from "./infra/postgres-plan-repository";
import { PostgresSubscriptionStore } from "./infra/postgres-subscription-store";

export const planRepository = lazy(() => new PostgresPlanRepository(sql()));
export const savePlan = lazy(() => new SavePlan(planRepository()));
export const listPlans = lazy(() => new ListPlans(planRepository()));
export const getPlan = lazy(() => new GetPlan(planRepository()));

// Assinaturas (#153). O provedor de pagamento vem do ambiente; hoje só o simulado.
export const subscriptionStore = lazy(() => new PostgresSubscriptionStore(sql()));
export const billingGateway = lazy(() => billingGatewayFrom(process.env));

// Quem paga: nome e e-mail pela API pública do módulo identity.
const customers: BillingCustomers = {
  find: async (ownerId) => {
    const [user] = await usersByIds([ownerId]);
    return user ? { name: user.displayName, email: user.email } : null;
  },
};
const now = () => new Date();

export const subscribe = lazy(() => new Subscribe(subscriptionStore(), subscriptionStore(), billingGateway, customers, now, localDate));
export const renewSubscriptions = lazy(() => new RenewSubscriptions(subscriptionStore(), billingGateway, customers, now, localDate));

// Direitos: o plano assinado, se a assinatura estiver em dia ou na carência; senão, o plano padrão.
export const planEntitlements = lazy(() => new PlanEntitlements(subscriptionPlanResolver(subscriptionStore(), defaultPlanResolver(planRepository()))));

// Pagamentos (#154): webhooks do provedor e inadimplência.
export const paymentLedger = lazy(() => new PostgresPaymentLedger(sql()));
/** null quando o segredo dos webhooks não está configurado: a rota e o simulador ficam desligados. */
export const handlePaymentWebhook = lazy(() => {
  const webhooks = paymentWebhooksFrom(process.env);
  return webhooks ? new HandlePaymentWebhook(() => webhooks, paymentLedger(), domainEvents()) : null;
});
export const enforceOverdue = lazy(() => new EnforceOverdue(paymentLedger(), domainEvents(), () => graceDaysFrom(process.env), now, localDate));
