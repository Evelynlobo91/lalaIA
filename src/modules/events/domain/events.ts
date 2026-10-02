// Eventos de domínio do módulo events (payload só com ids).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "events.EventPublished": { eventId: string; placeId: string; ownerId: string };
    "events.EventCancelled": { eventId: string };
    /** Admin editou ou cancelou o evento de outra pessoa (auditoria, #146). */
    "events.EventEditedByAdmin": { eventId: string; editedBy: string };
    "events.EventCancelledByAdmin": { eventId: string; cancelledBy: string };
  }
}

export {};
