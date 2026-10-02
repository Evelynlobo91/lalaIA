import type { DomainError, Result } from "@/shared/kernel";

/** Validade do link de convite. */
export const INVITE_DAYS = 14;

export const inviteKinds = [
  { id: "estabelecimento", label: "Estabelecimento" },
  { id: "promotor", label: "Promotor de eventos" },
] as const;
export type InviteKind = (typeof inviteKinds)[number]["id"];

/** O que o cadastro de parceiro precisa e o lead não tem. */
export type InviteData = { kind: InviteKind; phone: string; description: string; placeId: string | null };

export type InviteRecord = InviteData & {
  id: string;
  leadId: string;
  businessName: string;
  createdBy: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
  acceptedBy: string | null;
};

export type InviteStatus = "valid" | "expired" | "revoked" | "accepted";

export function inviteStatus(invite: Pick<InviteRecord, "expiresAt" | "revokedAt" | "acceptedAt">, now: Date): InviteStatus {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  return invite.expiresAt <= now ? "expired" : "valid";
}

export interface InviteStore {
  /**
   * Gera o convite do lead "como o time" (RLS), revogando o que estivesse em aberto.
   * null se o lead não existe (ou a RLS não deixa ver).
   */
  create(actorId: string, leadId: string, tokenHash: string, data: InviteData, expiresAt: Date): Promise<{ id: string } | null>;
  /** Convite em aberto do lead (para a página do lead), ou null. */
  openFor(actorId: string, leadId: string): Promise<{ id: string; createdAt: Date; expiresAt: Date } | null>;
  /** Pelo hash do token. Operação do sistema: quem abre o link não é do time. */
  findByTokenHash(tokenHash: string): Promise<InviteRecord | null>;
  /**
   * Marca a aceitação e leva o lead a "ativo", com o registro no histórico, numa transação (sistema).
   * false se o convite já tinha sido aceito ou revogado nesse meio-tempo.
   */
  markAccepted(inviteId: string, userId: string, partnerId: string): Promise<boolean>;
}

/** Token do link: só o hash é guardado. */
export interface InviteTokens {
  generate(): { token: string; hash: string };
  hash(token: string): string;
}

/** Ativa o parceiro pela API pública do módulo partners (sem duplicar o cadastro). */
export interface PartnerActivator {
  activate(input: { userId: string; activatedBy: string; kind: InviteKind; businessName: string; phone: string; description: string; placeId: string | null }): Promise<
    Result<{ partnerId: string; alreadyActive: boolean; placeLinked: boolean }, DomainError>
  >;
}
