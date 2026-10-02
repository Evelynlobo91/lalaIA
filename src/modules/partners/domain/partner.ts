export const partnerKinds = [
  { id: "estabelecimento", label: "Estabelecimento", hint: "Bar, restaurante, café, casa de shows, museu..." },
  { id: "promotor", label: "Promotor de eventos", hint: "Produz festas, shows, feiras ou experiências" },
] as const;

export type PartnerKind = (typeof partnerKinds)[number]["id"];
export type PartnerStatus = "pending" | "approved" | "rejected" | "suspended";

export type PartnerApplicationData = {
  kind: PartnerKind;
  businessName: string;
  /** Só dígitos, com DDD (e +55 opcional). */
  phone: string;
  instagram: string | null;
  /** Só dígitos; opcional na POC. */
  cnpj: string | null;
  description: string;
};

export type PartnerApplication = PartnerApplicationData & {
  id: string;
  ownerId: string;
  status: PartnerStatus;
  rejectionReason: string | null;
  /** Motivo da suspensão (só enquanto `status` é "suspended"); o parceiro vê no portal. */
  suspensionReason: string | null;
  createdAt: Date;
};

/** Linha da fila de revisão do admin (inclui quem pediu). */
export type PartnerReviewItem = PartnerApplication & { ownerName: string; ownerEmail: string };

/**
 * Persistência dos cadastros. `actorId` é quem está agindo (vem da sessão): as consultas rodam
 * "como ele" sob RLS, então o banco também garante que cada um só vê/edita o que pode.
 */
export interface PartnerRepository {
  findByOwner(actorId: string): Promise<PartnerApplication | null>;
  /** Cria ou reenvia (volta para "pendente") o cadastro do próprio usuário. */
  submit(actorId: string, data: PartnerApplicationData): Promise<PartnerApplication>;
  listForReview(actorId: string, status: PartnerStatus): Promise<PartnerReviewItem[]>;
  /** Muda o status (admin). Devolve o cadastro atualizado ou null se não existir. */
  review(actorId: string, partnerId: string, decision: { status: "approved" } | { status: "rejected"; reason: string }): Promise<PartnerApplication | null>;
  /** Parceiros aprovados e suspensos, por nome (admin). */
  listActive(actorId: string): Promise<PartnerReviewItem[]>;
  /** Suspende um parceiro aprovado (admin). null se não existir ou não estiver aprovado. */
  suspend(actorId: string, partnerId: string, reason: string): Promise<PartnerApplication | null>;
  /** Reativa um parceiro suspenso (admin). null se não existir ou não estiver suspenso. */
  reactivate(actorId: string, partnerId: string): Promise<PartnerApplication | null>;
}

/** Porta para conceder o papel de parceiro (implementada pela API pública do módulo identity). */
export interface PartnerRoleGranter {
  grantPartner(userId: string, grantedBy: string): Promise<void>;
}
