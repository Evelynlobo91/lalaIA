import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { PartnerApplication, PartnerRepository, PartnerRoleGranter, PartnerStatus } from "../../domain/partner";

/** Quem revisa: o papel é conferido aqui também (não só na página/action). */
export type Reviewer = { id: string; isAdmin: boolean };

export const reviewSchema = z.object({ partnerId: z.uuid() });
export const rejectSchema = reviewSchema.extend({
  reason: z.string().trim().min(5, "Explique o motivo (a pessoa vai ler para corrigir).").max(500),
});

export class ListPartnerApplications {
  constructor(private readonly partners: PartnerRepository) {}

  async execute(reviewer: Reviewer, status: PartnerStatus = "pending") {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    return ok(await this.partners.listForReview(reviewer.id, status));
  }
}

/**
 * Aprova o parceiro e concede o papel `partner`. Idempotente: se a concessão falhar depois da
 * aprovação, aprovar de novo completa o processo (o papel não duplica).
 */
export class ApprovePartner {
  constructor(
    private readonly partners: PartnerRepository,
    private readonly roles: PartnerRoleGranter,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(reviewer: Reviewer, partnerId: string): Promise<Result<PartnerApplication, DomainError>> {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    const approved = await this.partners.review(reviewer.id, partnerId, { status: "approved" });
    if (!approved) return err(new NotFoundError("Cadastro de parceiro"));

    await this.roles.grantPartner(approved.ownerId, reviewer.id);
    await this.events.publish("partners.PartnerApproved", { partnerId: approved.id, userId: approved.ownerId });
    return ok(approved);
  }
}

/** Recusa com motivo obrigatório; a pessoa pode corrigir e reenviar. */
export class RejectPartner {
  constructor(private readonly partners: PartnerRepository) {}

  async execute(reviewer: Reviewer, partnerId: string, reason: string): Promise<Result<PartnerApplication, DomainError>> {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    const rejected = await this.partners.review(reviewer.id, partnerId, { status: "rejected", reason });
    if (!rejected) return err(new NotFoundError("Cadastro de parceiro"));
    return ok(rejected);
  }
}
