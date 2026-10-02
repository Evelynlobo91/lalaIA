import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, ConflictError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { PartnerKind, PartnerRoleGranter } from "../../domain/partner";
import type { PlaceLookup } from "../../domain/place-claim";

/** Dados para ativar um parceiro sem o cadastro pelo portal (ex.: lead convertido pelo CRM, #150). */
export type PartnerActivation = {
  /** A conta que vira parceira (quem aceitou o convite). */
  userId: string;
  /** Quem do time autorizou a ativação (fica como revisor do cadastro). */
  activatedBy: string;
  kind: PartnerKind;
  businessName: string;
  phone: string;
  description: string;
  /** Lugar a vincular, se houver. */
  placeId: string | null;
};

export type ActivationOutcome =
  | { status: "activated" | "already_active"; partnerId: string; claimId: string | null }
  /** A conta tem um cadastro suspenso: só o backoffice reativa. */
  | { status: "suspended" };

/** Grava o parceiro aprovado e o vínculo com o lugar, na mesma transação. Operação do sistema (sem RLS). */
export interface PartnerActivationStore {
  /**
   * - Sem cadastro, ou cadastro pendente/recusado: fica aprovado com os dados informados.
   * - Já aprovado: nada é sobrescrito.
   * - `placeId`: vínculo aprovado, se o lugar ainda não tiver outro responsável (senão `claimId` vem null).
   */
  activate(input: PartnerActivation): Promise<ActivationOutcome>;
}

export type ActivatedPartner = { partnerId: string; alreadyActive: boolean; placeLinked: boolean };

/**
 * Ativa um parceiro já aprovado, a partir de dados que o time coletou (API pública para o CRM).
 * Idempotente: ativar de novo a mesma conta não cria um segundo parceiro nem sobrescreve o cadastro.
 */
export class ActivatePartner {
  constructor(
    private readonly store: PartnerActivationStore,
    private readonly places: PlaceLookup,
    private readonly roles: PartnerRoleGranter,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(input: PartnerActivation): Promise<Result<ActivatedPartner, DomainError>> {
    if (input.placeId && !(await this.places.summary(input.placeId))) {
      return err(new BusinessRuleError("place_not_found", "O lugar indicado no convite não existe mais."));
    }

    const outcome = await this.store.activate(input);
    if (outcome.status === "suspended") return err(new ConflictError("Esta conta tem um cadastro de parceiro suspenso. Fale com o suporte."));

    // Papel e eventos são idempotentes: repetir completa o que tiver falhado no meio.
    await this.roles.grantPartner(input.userId, input.activatedBy);
    if (outcome.status === "activated") {
      await this.events.publish("partners.PartnerApproved", { partnerId: outcome.partnerId, userId: input.userId, approvedBy: input.activatedBy });
    }
    if (outcome.claimId && input.placeId) {
      await this.events.publish("partners.PlaceClaimApproved", { claimId: outcome.claimId, placeId: input.placeId, userId: input.userId, approvedBy: input.activatedBy });
    }
    return ok({ partnerId: outcome.partnerId, alreadyActive: outcome.status === "already_active", placeLinked: outcome.claimId !== null });
  }
}
