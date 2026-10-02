// Eventos publicados pelo módulo identity. Payload só com IDs (sem e-mail ou nome: LGPD).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "identity.UserRegistered": { userId: string };
    /**
     * A pessoa pediu a exclusão da conta (LGPD). Publicado ANTES de apagar: cada módulo limpa ou anonimiza
     * o que não sai sozinho pela exclusão em cascata (ex.: desligar transmissões no provedor).
     */
    "identity.UserDeleted": { userId: string };
    /** Admin concedeu ou revogou um papel interno pela tela (#157). */
    "identity.RoleGranted": { userId: string; role: string; grantedBy: string };
    "identity.RoleRevoked": { userId: string; role: string; revokedBy: string };
  }
}

export {};
