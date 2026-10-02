import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import { paymentEventKinds, type PaymentLedger, type PaymentWebhooks, type SubscriptionChange } from "../../domain/payment";

/** Webhooks de pagamento têm poucos KB; acima disto, recusamos sem ler nem verificar (anti-DoS). */
export const MAX_PAYMENT_WEBHOOK_BYTES = 64 * 1024;

/** Evento já normalizado pelo adaptador: validado de novo antes de tocar no banco (defesa em profundidade). */
export const paymentEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  kind: z.enum(paymentEventKinds),
  gatewayInvoiceId: z.string().min(1).max(200),
  occurredAt: z.date(),
});

/** Publica suspensão e reativação a partir das mudanças de situação da assinatura. */
async function announce(events: DomainEventPublisher, changes: SubscriptionChange[]): Promise<void> {
  for (const change of changes) {
    const payload = { subscriptionId: change.subscriptionId, ownerId: change.ownerId };
    if (change.to === "suspended" && change.from !== "suspended") await events.publish("billing.SubscriptionSuspended", payload);
    if (change.to === "active" && change.from === "suspended") await events.publish("billing.SubscriptionReactivated", payload);
  }
}

export type WebhookReport = { received: number; applied: number; ignored: number; duplicate: number; unknown: number; invalid: number };

/**
 * Recebe o webhook do provedor de pagamento (#154): confere a assinatura, aplica cada evento de forma
 * idempotente e publica suspensão/reativação. Eventos repetidos ou de cobranças desconhecidas não são erro
 * (respondemos 200 para o provedor não reenviar).
 */
export class HandlePaymentWebhook {
  constructor(
    private readonly webhooks: () => PaymentWebhooks,
    private readonly ledger: Pick<PaymentLedger, "apply">,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(rawBody: string, headers: Headers): Promise<Result<WebhookReport, DomainError>> {
    const webhooks = this.webhooks();
    const parsed = webhooks.parse(rawBody, headers);
    if (!parsed.ok) return parsed;

    const report: WebhookReport = { received: parsed.value.length, applied: 0, ignored: 0, duplicate: 0, unknown: 0, invalid: 0 };
    for (const raw of parsed.value) {
      const event = paymentEventSchema.safeParse(raw);
      if (!event.success) {
        report.invalid++;
        continue;
      }
      const applied = await this.ledger.apply(webhooks.gateway, event.data);
      if (applied.outcome === "unknown_invoice") report.unknown++;
      else report[applied.outcome]++;
      if (applied.change) await announce(this.events, [applied.change]);
    }
    return ok(report);
  }
}

const DAY_MS = 86_400_000;

/**
 * Inadimplência (#154), junto com o ciclo diário: marca como vencidas as faturas que passaram do vencimento
 * (a assinatura entra na carência) e suspende quem continua sem pagar depois da carência.
 */
export class EnforceOverdue {
  constructor(
    private readonly ledger: Pick<PaymentLedger, "markOverdue" | "suspendOverdue">,
    private readonly events: DomainEventPublisher,
    private readonly graceDays: () => number,
    private readonly now: () => Date,
    private readonly dayOf: (date: Date) => string,
  ) {}

  async execute(): Promise<{ overdue: number; suspended: number }> {
    const now = this.now();
    const overdue = await this.ledger.markOverdue(this.dayOf(now));
    // Suspende quando a fatura venceu há mais dias que a carência.
    const suspended = await this.ledger.suspendOverdue(this.dayOf(new Date(now.getTime() - this.graceDays() * DAY_MS)));
    await announce(this.events, [...overdue, ...suspended]);
    return { overdue: overdue.length, suspended: suspended.length };
  }
}
