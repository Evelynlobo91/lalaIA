// Eventos publicados pelo módulo partners (payload só com ids).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "partners.PartnerApproved": { partnerId: string; userId: string };
  }
}

export {};
