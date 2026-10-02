import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { UnauthorizedError, ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { paymentEventKinds, type PaymentEvent, type PaymentWebhooks } from "../domain/payment";

// Assinatura do provedor simulado, no mesmo formato usado por provedores reais:
//   x-billing-signature: t=<segundos Unix>,v1=<hex do HMAC-SHA256(segredo, "<t>.<corpo cru>")>
export const BILLING_SIGNATURE_HEADER = "x-billing-signature";
/** Tolerância entre o carimbo da assinatura e o relógio do servidor (anti-replay). */
const TOLERANCE_SECONDS = 5 * 60;

const hmacHex = (secret: string, timestamp: string, rawBody: string) => createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

/** Gera o valor do header (simulador de pagamento, testes e E2E). */
export function signBillingWebhook(secret: string, rawBody: string, now: Date = new Date()): string {
  const t = String(Math.floor(now.getTime() / 1000));
  return `t=${t},v1=${hmacHex(secret, t, rawBody)}`;
}

function validSignature(secret: string, rawBody: string, header: string | null, now: Date): boolean {
  if (!header || header.length > 500) return false;
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3).toLowerCase();
  if (!t || !/^\d{1,12}$/.test(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - Number(t)) > TOLERANCE_SECONDS) return false;
  // Comparação em tempo constante.
  return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(hmacHex(secret, t, rawBody), "hex"));
}

const payloadSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(paymentEventKinds.map((k) => `invoice.${k}`) as [string, ...string[]]),
  invoiceId: z.string().min(1).max(200),
  occurredAt: z.iso.datetime(),
});

export type FakePaymentPayload = { id: string; type: `invoice.${(typeof paymentEventKinds)[number]}`; invoiceId: string; occurredAt: string };

/** Webhooks do provedor simulado: um evento por requisição, assinado com `BILLING_FAKE_WEBHOOK_SECRET`. */
export class FakePaymentWebhooks implements PaymentWebhooks {
  readonly gateway = "fake";

  constructor(
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  parse(rawBody: string, headers: Headers): Result<PaymentEvent[], DomainError> {
    // A assinatura é conferida antes de interpretar o corpo.
    if (!validSignature(this.secret, rawBody, headers.get(BILLING_SIGNATURE_HEADER), this.now())) return err(new UnauthorizedError());
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return err(new ValidationError("Corpo inválido."));
    }
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) return err(new ValidationError("Evento de pagamento inválido."));
    const kind = parsed.data.type.slice("invoice.".length) as PaymentEvent["kind"];
    return ok([{ eventId: parsed.data.id, kind, gatewayInvoiceId: parsed.data.invoiceId, occurredAt: new Date(parsed.data.occurredAt) }]);
  }
}
