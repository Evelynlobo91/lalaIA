import "server-only";
import type { BillingGateway } from "../domain/subscription";
import { FakeBillingGateway } from "./fake-billing-gateway";

export type BillingEnv = Record<string, string | undefined>;

/**
 * Escolha do provedor de pagamento pelo ambiente. Hoje só existe o simulado: o provedor real (Asaas,
 * Mercado Pago ou Stripe) é uma decisão pendente, e entra aqui como um novo adaptador de `BillingGateway`.
 * `BILLING_PROVIDER` com outro valor falha cedo, para ninguém achar que está cobrando de verdade.
 */
export function billingGatewayFrom(env: BillingEnv): BillingGateway {
  const provider = env.BILLING_PROVIDER?.trim() || "fake";
  if (provider !== "fake") throw new Error(`BILLING_PROVIDER="${provider}" não é suportado: só o provedor simulado ("fake") está implementado. Veja docs/billing.md.`);
  return new FakeBillingGateway();
}
