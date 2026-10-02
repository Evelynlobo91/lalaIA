// Eventos de domínio do módulo live (payload só com ids e o status novo).
// Recomendação, Mapa e notificações podem assinar sem conhecer o módulo.
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "live.StreamStatusChanged": {
      streamId: string;
      entityType: "place" | "event";
      entityId: string;
      status: "waiting" | "live" | "paused" | "ended";
    };
  }
}

export {};
