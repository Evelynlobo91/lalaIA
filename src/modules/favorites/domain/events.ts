// Eventos de domínio do módulo favorites (payload só com ids, para o Analytics).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    "favorites.FavoriteAdded": { userId: string; entityType: "place" | "event"; entityId: string };
  }
}

export {};
