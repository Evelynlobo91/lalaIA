// Eventos de domínio do módulo places (payload só com ids).
declare module "@/shared/events/domain-event" {
  interface DomainEventMap {
    /** Admin cadastrou um estabelecimento direto pelo backoffice (#143). */
    "places.PlaceCreatedByAdmin": { placeId: string; createdBy: string };
    /** Admin editou um lugar que não é dele (o dono editar o próprio lugar não publica). */
    "places.PlaceEditedByAdmin": { placeId: string; editedBy: string };
  }
}

export {};
