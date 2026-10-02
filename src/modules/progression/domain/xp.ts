// XP como livro-razão append-only (epic #10): nunca um campo somado. O saldo é a soma das transações.

export const xpReasons = ["mission_step", "mission_completed", "achievement"] as const;
export type XpReason = (typeof xpReasons)[number];

export type NewXpTransaction = {
  userId: string;
  amount: number;
  reason: XpReason;
  /** Origem (etapa, missão ou desbloqueio de conquista). Com `userId` e `reason`, é a chave natural: a mesma origem não credita duas vezes. */
  sourceId: string;
  description: string;
  /** Id do evento de domínio que gerou o crédito (auditoria e deduplicação). */
  eventId: string;
};

export type XpTransaction = Omit<NewXpTransaction, "eventId"> & { id: string; createdAt: Date };

export interface XpLedger {
  /** Grava a transação; `false` se ela já existia (mesmo evento ou mesma origem): idempotente. */
  append(entry: NewXpTransaction): Promise<boolean>;
  /** Leituras como o próprio usuário (asUser): RLS só mostra as dele. */
  balanceOf(userId: string): Promise<number>;
  history(userId: string, limit: number): Promise<XpTransaction[]>;
}

/** Porta para o título das missões (implementada pela API pública do módulo missions). */
export interface MissionTitles {
  titleOf(missionId: string): Promise<string | null>;
}
