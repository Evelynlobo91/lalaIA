"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { BusinessRuleError, NotFoundError, err, ok } from "@/shared/kernel";
import { handlePaymentWebhook, subscriptionStore } from "../../composition";
import { fakeWebhookSecret } from "../../infra/billing-config";
import { BILLING_SIGNATURE_HEADER, signBillingWebhook, type FakePaymentPayload } from "../../infra/fake-payment-webhooks";

const schema = z.object({ gatewayInvoiceId: z.string().regex(/^fake_[0-9a-f]{24}$/) });

/**
 * Simulador do provedor de pagamento (só existe com o provedor simulado): faz o que o provedor real faria
 * depois de um pagamento, ou seja, entrega um webhook "invoice.paid" assinado ao mesmo caso de uso da rota.
 * Só o dono da cobrança consegue simular o próprio pagamento.
 */
const simulate = formAction(
  schema,
  withUser(async (input, user) => {
    const secret = fakeWebhookSecret(process.env);
    const handler = handlePaymentWebhook();
    if (!secret || !handler) return err(new BusinessRuleError("simulator_disabled", "O simulador de pagamento não está configurado neste ambiente."));

    const subscription = await subscriptionStore().findByOwner(user.id);
    const invoice = subscription ? await subscriptionStore().findInvoiceByGatewayId(subscription.id, input.gatewayInvoiceId) : null;
    if (!invoice) return err(new NotFoundError("Cobrança"));

    const payload: FakePaymentPayload = { id: `evt_${crypto.randomUUID()}`, type: "invoice.paid", invoiceId: input.gatewayInvoiceId, occurredAt: new Date().toISOString() };
    const raw = JSON.stringify(payload);
    const result = await handler.execute(raw, new Headers({ [BILLING_SIGNATURE_HEADER]: signBillingWebhook(secret, raw) }));
    return result.ok ? ok({ paid: true }) : result;
  }),
  { name: "billing.simulatePayment" },
);

export async function simulatePaymentAction(previous: FormState<{ paid: boolean }>, formData: FormData) {
  const state = await simulate(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro", "layout");
  return state;
}
