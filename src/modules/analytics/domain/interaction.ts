/** Interações registradas para as métricas (RF25). Nunca guardam QUEM fez (LGPD), só o quê, onde e quando. */
export const interactionKinds = ["view", "favorite", "quero_ir", "live_view", "checkin"] as const;
export type InteractionKind = (typeof interactionKinds)[number];

export const interactionEntityTypes = ["place", "event", "mission", "live"] as const;
export type InteractionEntityType = (typeof interactionEntityTypes)[number];

export type Interaction = {
  kind: InteractionKind;
  entityType: InteractionEntityType;
  entityId: string;
  occurredAt: Date;
} & ({ source: "ui" } | { source: "domain"; eventId: string });

/** Porta de escrita (append-only). Interação de domínio repetida (mesmo `eventId`) é ignorada. */
export interface InteractionStore {
  record(interaction: Interaction): Promise<void>;
}

/** Executa trabalho depois da resposta ao usuário (a escrita nunca bloqueia a tela). */
export interface BackgroundRunner {
  run(task: () => Promise<void>): void;
}
