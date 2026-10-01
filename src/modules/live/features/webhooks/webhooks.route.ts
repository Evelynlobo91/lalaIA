import { errorResponse, resultResponse } from "@/shared/http/responses";
import { observed } from "@/shared/http/observed";
import { ValidationError } from "@/shared/kernel";
import { logger } from "@/shared/observability";
import type { HandleProviderWebhook } from "./webhooks.use-case";
import { MAX_WEBHOOK_BYTES } from "./webhooks.schema";

const tooLarge = () => Response.json({ error: { code: "payload_too_large", message: "Corpo grande demais." } }, { status: 413 });

/**
 * POST /api/live/webhooks — lê o corpo CRU (a assinatura é sobre os bytes exatos, não sobre o JSON
 * reinterpretado). Assinatura inválida → 401. Eventos repetidos ou de transmissões desconhecidas → 200,
 * para o provedor não reenviar.
 */
export function webhooksRoute(handler: () => HandleProviderWebhook) {
  return observed(async (request) => {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_WEBHOOK_BYTES) return tooLarge();
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_WEBHOOK_BYTES) return tooLarge();
    if (!raw) return errorResponse(new ValidationError("Corpo vazio."));

    const result = await handler().execute(raw, request.headers);
    if (!result.ok) {
      logger().warn("webhook da live recusado", { reason: result.error.code });
    } else if (result.value.unknown || result.value.invalid) {
      logger().warn("webhook da live com eventos ignorados", { ...result.value });
    }
    return resultResponse(result);
  });
}
