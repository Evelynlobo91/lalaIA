// Eventos de domínio do módulo events (payload só com ids).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "events.EventPublished": { eventId: string; placeId: string; ownerId: string };
    "events.EventCancelled": { eventId: string };
  }
}

export {};
