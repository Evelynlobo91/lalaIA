import { z } from "zod";
import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { PlaceClaim, PlaceClaimRepository, PlaceClaimView, PlaceLookup } from "../../domain/place-claim";
import type { Reviewer } from "../review/review.use-cases";

export const claimSchema = z.object({ placeId: z.uuid({ error: "Lugar inválido." }) });
export const claimReviewSchema = z.object({ claimId: z.uuid() });
export const claimRejectSchema = claimReviewSchema.extend({ reason: z.string().trim().min(5, "Explique o motivo.").max(500) });

/** Parceiro aprovado pedindo vínculo com um lugar. */
export type ClaimingPartner = { userId: string; partnerId: string };

const ALREADY_MANAGED = "Este lugar já tem um responsável. Se for seu, fale com o suporte.";

/** RF (#28) — "Este estabelecimento é meu": pedido de vínculo, aprovado por admin. */
export class RequestPlaceClaim {
  constructor(
    private readonly claims: PlaceClaimRepository,
    private readonly places: PlaceLookup,
  ) {}

  async execute(partner: ClaimingPartner, placeId: string): Promise<Result<PlaceClaim, DomainError>> {
    const place = await this.places.summary(placeId);
    if (!place) return err(new NotFoundError("Lugar"));
    // Não revela quem é o dono; só que o lugar não está disponível.
    if (place.managed) return err(new ConflictError(ALREADY_MANAGED));
    const claim = await this.claims.request(partner.userId, partner.partnerId, placeId);
    if (claim.status === "approved") return err(new BusinessRuleError("already_yours", "Este lugar já está vinculado a você."));
    return ok(claim);
  }
}

/** Pedidos do parceiro com o nome dos lugares. */
export class ListMyClaims {
  constructor(
    private readonly claims: PlaceClaimRepository,
    private readonly places: PlaceLookup,
  ) {}

  async execute(partner: ClaimingPartner): Promise<Array<PlaceClaim & { placeName: string }>> {
    const mine = await this.claims.listMine(partner.userId, partner.partnerId);
    return Promise.all(mine.map(async (c) => ({ ...c, placeName: (await this.places.summary(c.placeId))?.name ?? "Lugar removido" })));
  }
}

export class ListClaimsForReview {
  constructor(
    private readonly claims: PlaceClaimRepository,
    private readonly places: PlaceLookup,
  ) {}

  async execute(reviewer: Reviewer): Promise<Result<PlaceClaimView[], ForbiddenError>> {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    const pending = await this.claims.listForReview(reviewer.id);
    return ok(await Promise.all(pending.map(async (c) => ({ ...c, placeName: (await this.places.summary(c.placeId))?.name ?? "Lugar removido" }))));
  }
}

/**
 * Aprova o vínculo e avisa o módulo places (evento), que marca o responsável pelo lugar.
 * Um lugar só tem um dono aprovado (índice único no banco).
 */
export class ApprovePlaceClaim {
  constructor(
    private readonly claims: PlaceClaimRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(reviewer: Reviewer, claimId: string): Promise<Result<PlaceClaim, DomainError>> {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    let approved;
    try {
      approved = await this.claims.review(reviewer.id, claimId, { status: "approved" });
    } catch (error) {
      if (String((error as { code?: string }).code) === "23505") return err(new ConflictError("Este lugar já tem outro responsável aprovado."));
      throw error;
    }
    if (!approved) return err(new NotFoundError("Pedido de vínculo"));
    await this.events.publish("partners.PlaceClaimApproved", { claimId: approved.id, placeId: approved.placeId, userId: approved.ownerId });
    return ok(approved);
  }
}

export class RejectPlaceClaim {
  constructor(private readonly claims: PlaceClaimRepository) {}

  async execute(reviewer: Reviewer, claimId: string, reason: string): Promise<Result<PlaceClaim, DomainError>> {
    if (!reviewer.isAdmin) return err(new ForbiddenError());
    const rejected = await this.claims.review(reviewer.id, claimId, { status: "rejected", reason });
    return rejected ? ok(rejected) : err(new NotFoundError("Pedido de vínculo"));
  }
}
