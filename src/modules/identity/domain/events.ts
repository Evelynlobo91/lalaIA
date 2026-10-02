// Eventos publicados pelo módulo identity. Payload só com IDs (sem e-mail ou nome: LGPD).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "identity.UserRegistered": { userId: string };
  }
}

export {};
