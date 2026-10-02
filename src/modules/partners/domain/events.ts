// Eventos publicados pelo módulo partners (payload só com ids).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "partners.PartnerApproved": { partnerId: string; userId: string; approvedBy: string };
    "partners.PartnerRejected": { partnerId: string; userId: string; rejectedBy: string };
    /** Admin suspendeu o parceiro: o que ele publicou some do app (os módulos filtram por `platform.owner_suspended`). */
    "partners.PartnerSuspended": { partnerId: string; userId: string; suspendedBy: string };
    "partners.PartnerReactivated": { partnerId: string; userId: string; reactivatedBy: string };
    /** Vínculo parceiro ↔ lugar aprovado: o módulo places marca o responsável pelo lugar. */
    "partners.PlaceClaimApproved": { claimId: string; placeId: string; userId: string; approvedBy: string };
    "partners.PlaceClaimRejected": { claimId: string; placeId: string; userId: string; rejectedBy: string };
    /** Explorador resgatou uma oferta (só na primeira vez; repetir o resgate não publica). */
    "partners.OfferRedeemed": { offerId: string; redemptionId: string; userId: string; targetType: "place" | "event"; targetId: string };
    /** Parceiro validou o código no balcão (a visita aconteceu). `userId` é quem resgatou. */
    "partners.OfferValidated": { offerId: string; redemptionId: string; userId: string; validatedBy: string; targetType: "place" | "event"; targetId: string };
  }
}

export {};
