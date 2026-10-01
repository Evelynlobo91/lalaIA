// Eventos publicados pelo módulo partners (payload só com ids).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "partners.PartnerApproved": { partnerId: string; userId: string };
    /** Vínculo parceiro ↔ lugar aprovado: o módulo places marca o responsável pelo lugar. */
    "partners.PlaceClaimApproved": { claimId: string; placeId: string; userId: string };
  }
}

export {};
