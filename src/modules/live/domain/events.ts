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
    /** A moderação desativou/reativou uma chamada (CTA) de uma live (#182). */
    "live.CtaDisabledByAdmin": { ctaId: string; streamId: string; disabledBy: string };
    "live.CtaEnabledByAdmin": { ctaId: string; streamId: string; enabledBy: string };
    /** A moderação resolveu as denúncias de uma mensagem do chat (#193): apagou ou manteve. */
    "live.ChatReportResolved": { messageId: string; resolvedBy: string; resolution: "removed" | "kept" };
  }
}

export {};
