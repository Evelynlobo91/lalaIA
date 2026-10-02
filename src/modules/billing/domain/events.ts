// Eventos de domínio do módulo billing (payload só com ids).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    /** A assinatura foi suspensa por falta de pagamento ou estorno: os recursos pagos deixam de valer. */
    "billing.SubscriptionSuspended": { subscriptionId: string; ownerId: string };
    /** O pagamento chegou: a assinatura voltou a ficar em dia. */
    "billing.SubscriptionReactivated": { subscriptionId: string; ownerId: string };
  }
}

export {};
