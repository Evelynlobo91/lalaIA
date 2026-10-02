export const auditTargetTypes = ["partner", "place_claim", "place", "event", "mission", "user", "live_cta", "chat_message"] as const;
export type AuditTargetType = (typeof auditTargetTypes)[number];

/** Ação administrativa registrada: quem, o quê, em quê e quando. Só ids (nenhum dado pessoal nem conteúdo). */
export type AuditEntry = {
  /** Id do evento de domínio de origem (deduplicação). */
  eventId: string;
  actorId: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  occurredAt: Date;
};

export type AuditFilter = { action?: string; actorId?: string; since?: Date; limit: number };

export interface AuditLog {
  /** Idempotente pelo `eventId`: o mesmo evento não gera dois registros. */
  append(entry: AuditEntry): Promise<void>;
  /** Do mais recente para o mais antigo. */
  list(filter: AuditFilter): Promise<AuditEntry[]>;
}

/** Nome de quem agiu, para a tela (API pública do módulo identity). */
export interface AuditActors {
  names(ids: string[]): Promise<Map<string, string>>;
}
