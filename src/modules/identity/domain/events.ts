// Eventos publicados pelo módulo identity. Payload só com IDs (sem e-mail ou nome: LGPD).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "identity.UserRegistered": { userId: string };
    /**
     * A pessoa pediu a exclusão da conta (LGPD). Publicado ANTES de apagar: cada módulo limpa ou anonimiza
     * o que não sai sozinho pela exclusão em cascata (ex.: desligar transmissões no provedor).
     */
    "identity.UserDeleted": { userId: string };
  }
}

export {};
