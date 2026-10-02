import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { PaymentLedger, SubscriptionChange } from "../../domain/payment";
import type { BillingActor } from "../../domain/plan";
import type { InvoiceStatus } from "../../domain/subscription";

export const confirmPaymentSchema = z.object({ invoiceId: z.uuid() });

/** O que o caso de uso precisa da fatura para confirmá-la. */
export type InvoiceToConfirm = { id: string; ownerId: string; gateway: string; gatewayInvoiceId: string; status: InvoiceStatus };

/** Leitura "como a pessoa do time" (RLS: só quem tem billing:read enxerga faturas dos outros). */
export interface InvoiceLookup {
  find(actorId: string, invoiceId: string): Promise<InvoiceToConfirm | null>;
}

/**
 * O time financeiro confirma que recebeu o pagamento de uma fatura por fora (Pix direto, transferência, cortesia
 * do piloto). Passa pelo MESMO caminho do webhook de "pago": a fatura fica paga, o plano dela passa a valer e a
 * assinatura fica em dia. Idempotente (`manual:<fatura>`). Quem confirmou fica na trilha de auditoria.
 */
export class ConfirmPaymentManually {
  constructor(
    private readonly invoices: InvoiceLookup,
    private readonly ledger: Pick<PaymentLedger, "apply">,
    private readonly events: DomainEventPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: BillingActor, invoiceId: string): Promise<Result<{ invoiceId: string }, DomainError>> {
    if (!actor.canWrite) return err(new ForbiddenError());
    const invoice = await this.invoices.find(actor.id, invoiceId);
    if (!invoice) return err(new NotFoundError("Fatura"));
    if (invoice.status !== "pending" && invoice.status !== "overdue") {
      return err(new BusinessRuleError("invoice_not_open", "Só dá para confirmar o pagamento de uma fatura em aberto ou vencida."));
    }

    const applied = await this.ledger.apply(invoice.gateway, { eventId: `manual:${invoice.id}`, kind: "paid", gatewayInvoiceId: invoice.gatewayInvoiceId, occurredAt: this.now() });
    if (applied.outcome !== "applied") {
      // Outra pessoa confirmou (ou o provedor avisou) no meio do caminho: nada a fazer.
      return err(new BusinessRuleError("invoice_not_open", "Esta fatura já não está em aberto."));
    }

    await this.events.publish("billing.PaymentConfirmedManually", { invoiceId: invoice.id, ownerId: invoice.ownerId, confirmedBy: actor.id });
    await announceReactivation(this.events, applied.change);
    return ok({ invoiceId: invoice.id });
  }
}

/** Suspensa → em dia: quem assina a reativação (ex.: a live) fica sabendo, como no pagamento pelo provedor. */
async function announceReactivation(events: DomainEventPublisher, change: SubscriptionChange | null): Promise<void> {
  if (change && change.from === "suspended" && change.to === "active") {
    await events.publish("billing.SubscriptionReactivated", { subscriptionId: change.subscriptionId, ownerId: change.ownerId });
  }
}
