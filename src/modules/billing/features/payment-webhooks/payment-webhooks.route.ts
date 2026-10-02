import { observed } from "@/shared/http/observed";
import { errorResponse, resultResponse } from "@/shared/http/responses";
import { ValidationError } from "@/shared/kernel";
import { logger } from "@/shared/observability";
import { MAX_PAYMENT_WEBHOOK_BYTES, type HandlePaymentWebhook } from "./payment-webhooks.use-cases";

const tooLarge = () => Response.json({ error: { code: "payload_too_large", message: "Corpo grande demais." } }, { status: 413 });
const notConfigured = () => Response.json({ error: { code: "not_configured" } }, { status: 503 });

/**
 * POST /api/billing/webhooks: lê o corpo CRU (a assinatura é sobre os bytes exatos). Assinatura inválida → 401.
 * Eventos repetidos ou de cobranças desconhecidas → 200, para o provedor não reenviar. Sem o segredo
 * configurado, a rota fica desligada (503).
 */
export function paymentWebhooksRoute(handler: () => HandlePaymentWebhook | null) {
  return observed(async (request) => {
    const useCase = handler();
    if (!useCase) return notConfigured();

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_PAYMENT_WEBHOOK_BYTES) return tooLarge();
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_PAYMENT_WEBHOOK_BYTES) return tooLarge();
    if (!raw) return errorResponse(new ValidationError("Corpo vazio."));

    const result = await useCase.execute(raw, request.headers);
    if (!result.ok) logger().warn("webhook de pagamento recusado", { reason: result.error.code });
    else if (result.value.unknown || result.value.invalid) logger().warn("webhook de pagamento com eventos ignorados", { ...result.value });
    return resultResponse(result);
  });
}
