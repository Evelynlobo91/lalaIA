import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { ConflictError, ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { PartnerApplication, PartnerRepository, PartnerReviewItem } from "../../domain/partner";
import type { Reviewer } from "../review/review.use-cases";

export const reactivateSchema = z.object({ partnerId: z.uuid() });
export const suspendSchema = reactivateSchema.extend({
  reason: z.string().trim().min(5, "Explique o motivo (o parceiro vai ler no portal).").max(500),
});

/** Parceiros aprovados e suspensos, para o admin suspender ou reativar. */
export class ListActivePartners {
  constructor(private readonly partners: Pick<PartnerRepository, "listActive">) {}

  async execute(reviewer: Reviewer): Promise<Result<PartnerReviewItem[], DomainError>> {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    return ok(await this.partners.listActive(reviewer.id));
  }
}

/**
 * Suspende um parceiro aprovado, com motivo. O que ele publicou some das telas públicas na mesma
 * transação (espelho `platform.suspended_owners`, mantido por trigger); o evento é só um aviso.
 */
export class SuspendPartner {
  constructor(
    private readonly partners: Pick<PartnerRepository, "suspend">,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(reviewer: Reviewer, partnerId: string, reason: string): Promise<Result<PartnerApplication, DomainError>> {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    const suspended = await this.partners.suspend(reviewer.id, partnerId, reason);
    if (!suspended) return err(new ConflictError("Só dá para suspender um parceiro aprovado."));
    await this.events.publish("partners.PartnerSuspended", { partnerId: suspended.id, userId: suspended.ownerId, suspendedBy: reviewer.id });
    return ok(suspended);
  }
}

/** Reativa um parceiro suspenso: o conteúdo dele volta a aparecer, sem recadastro. */
export class ReactivatePartner {
  constructor(
    private readonly partners: Pick<PartnerRepository, "reactivate">,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(reviewer: Reviewer, partnerId: string): Promise<Result<PartnerApplication, DomainError>> {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    const reactivated = await this.partners.reactivate(reviewer.id, partnerId);
    if (!reactivated) return err(new ConflictError("Este parceiro não está suspenso."));
    await this.events.publish("partners.PartnerReactivated", { partnerId: reactivated.id, userId: reactivated.ownerId, reactivatedBy: reviewer.id });
    return ok(reactivated);
  }
}
