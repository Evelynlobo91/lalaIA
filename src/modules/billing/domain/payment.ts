import type { DomainError, Result } from "@/shared/kernel";
import type { SubscriptionStatus } from "./subscription";

/** Dias de carência entre o vencimento e a suspensão, quando `BILLING_GRACE_DAYS` não está definido. */
export const DEFAULT_GRACE_DAYS = 5;

export const paymentEventKinds = ["paid", "overdue", "refunded"] as const;
export type PaymentEventKind = (typeof paymentEventKinds)[number];

/** Evento de pagamento já normalizado pelo adaptador do provedor. Só ids: nenhum dado de cartão ou do pagador. */
export type PaymentEvent = { eventId: string; kind: PaymentEventKind; gatewayInvoiceId: string; occurredAt: Date };

/** Lê e autentica o webhook do provedor. Trocar de provedor é trocar o adaptador. */
export interface PaymentWebhooks {
  readonly gateway: string;
  /** Confere a assinatura sobre o corpo CRU e devolve os eventos; assinatura inválida → erro (401). */
  parse(rawBody: string, headers: Headers): Result<PaymentEvent[], DomainError>;
}

/** O que mudou na assinatura ao aplicar um evento (para publicar suspensão e reativação). */
export type SubscriptionChange = { subscriptionId: string; ownerId: string; from: SubscriptionStatus; to: SubscriptionStatus };

export type AppliedEvent = { outcome: "applied" | "ignored" | "unknown_invoice" | "duplicate"; change: SubscriptionChange | null };

export interface PaymentLedger {
  /**
   * Aplica um evento numa transação: registra no log (idempotente pelo id do evento), atualiza a fatura e a
   * assinatura. Evento repetido → "duplicate", sem efeito.
   * - paid: fatura paga; o plano da fatura passa a valer, a assinatura fica em dia e o ciclo é o da fatura.
   * - overdue: fatura vencida; assinatura em dia entra na carência (past_due).
   * - refunded: fatura estornada; a assinatura é suspensa.
   */
  apply(gateway: string, event: PaymentEvent): Promise<AppliedEvent>;
  /** Faturas em aberto com vencimento antes de `today` viram vencidas (caso o provedor não avise). Devolve as mudanças de assinatura. */
  markOverdue(today: string): Promise<SubscriptionChange[]>;
  /** Assinaturas na carência cuja fatura venceu antes de `limit` são suspensas. */
  suspendOverdue(limit: string): Promise<SubscriptionChange[]>;
}
