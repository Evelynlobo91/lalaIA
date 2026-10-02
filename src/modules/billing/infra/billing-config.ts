import "server-only";
import { z } from "zod";
import { DEFAULT_GRACE_DAYS, type PaymentWebhooks } from "../domain/payment";
import type { BillingGateway } from "../domain/subscription";
import { FakeBillingGateway } from "./fake-billing-gateway";
import { FakePaymentWebhooks } from "./fake-payment-webhooks";

export type BillingEnv = Record<string, string | undefined>;

/**
 * Escolha do provedor de pagamento pelo ambiente. Hoje só existe o simulado: o provedor real (Asaas,
 * Mercado Pago ou Stripe) é uma decisão pendente, e entra aqui como um novo adaptador de `BillingGateway`
 * e de `PaymentWebhooks`. `BILLING_PROVIDER` com outro valor falha cedo, para ninguém achar que está
 * cobrando de verdade.
 */
function provider(env: BillingEnv): "fake" {
  const name = env.BILLING_PROVIDER?.trim() || "fake";
  if (name !== "fake") throw new Error(`BILLING_PROVIDER="${name}" não é suportado: só o provedor simulado ("fake") está implementado. Veja docs/billing.md.`);
  return name;
}

export function billingGatewayFrom(env: BillingEnv): BillingGateway {
  provider(env);
  return new FakeBillingGateway();
}

const fakeSecretSchema = z.string().min(32, "BILLING_FAKE_WEBHOOK_SECRET precisa ter pelo menos 32 caracteres");

/** Segredo dos webhooks do provedor simulado; null se não estiver configurado (webhooks e simulador desligados). */
export function fakeWebhookSecret(env: BillingEnv): string | null {
  const parsed = fakeSecretSchema.safeParse(env.BILLING_FAKE_WEBHOOK_SECRET);
  return parsed.success ? parsed.data : null;
}

/** Leitor dos webhooks de pagamento; null se o segredo não estiver configurado (a rota responde 503). */
export function paymentWebhooksFrom(env: BillingEnv): PaymentWebhooks | null {
  provider(env);
  const secret = fakeWebhookSecret(env);
  return secret ? new FakePaymentWebhooks(secret) : null;
}

/** Carência, em dias, entre o vencimento e a suspensão. Valor inválido cai no padrão. */
export function graceDaysFrom(env: BillingEnv): number {
  const parsed = z.coerce.number().int().min(0).max(60).safeParse(env.BILLING_GRACE_DAYS || undefined);
  return parsed.success ? parsed.data : DEFAULT_GRACE_DAYS;
}
