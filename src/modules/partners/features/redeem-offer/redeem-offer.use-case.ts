import type { DomainEventPublisher } from "@/shared/events";
import { BusinessRuleError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import { generateOfferCode } from "../../domain/offer-code";
import { availabilityOf, type OfferAvailability, type OfferRepository, type Redemption, type RedemptionRepository } from "../../domain/offer";

/** Porta: cadastro de parceiro (aprovado) da pessoa, para ela não resgatar a própria oferta. */
export type PartnerIdOf = (userId: string) => Promise<string | null>;

const UNAVAILABLE: Record<Exclude<OfferAvailability, "available">, string> = {
  upcoming: "Esta oferta ainda não começou.",
  expired: "Esta oferta já terminou.",
  sold_out: "Esta oferta esgotou.",
  ended: "Esta oferta foi encerrada.",
};

const MAX_CODE_ATTEMPTS = 3;

/**
 * #30 — Resgatar uma oferta: gera um código curto que a pessoa mostra no balcão.
 * Idempotente por pessoa (resgatar de novo devolve o mesmo código e não publica evento). O limite total é
 * garantido pelo banco (trigger com lock na linha da oferta), mesmo com resgates simultâneos.
 */
export class RedeemOffer {
  constructor(
    private readonly offers: OfferRepository,
    private readonly redemptions: RedemptionRepository,
    private readonly partnerIdOf: PartnerIdOf,
    private readonly events: DomainEventPublisher,
    private readonly now: () => Date = () => new Date(),
    private readonly newCode: () => string = () => generateOfferCode(),
  ) {}

  async execute(userId: string, offerId: string): Promise<Result<{ redemption: Redemption; created: boolean }, DomainError>> {
    const offer = await this.offers.findById(offerId);
    if (!offer) return err(new NotFoundError("Oferta"));

    const existing = await this.redemptions.findMine(userId, offerId);
    if (existing) return ok({ redemption: existing, created: false });

    if ((await this.partnerIdOf(userId)) === offer.partnerId) return err(new BusinessRuleError("own_offer", "Você não pode resgatar a própria oferta."));

    const availability = availabilityOf(offer, this.now());
    if (availability !== "available") return err(new BusinessRuleError(`offer_${availability}`, UNAVAILABLE[availability]));

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const outcome = await this.redemptions.redeem(userId, offerId, this.newCode());
      if (outcome.kind === "code_taken") continue;
      if (outcome.kind === "sold_out") return err(new BusinessRuleError("offer_sold_out", UNAVAILABLE.sold_out));
      if (outcome.kind === "unavailable") return err(new BusinessRuleError("offer_unavailable", "Esta oferta não está disponível agora."));

      const { redemption, created } = outcome;
      if (created) {
        await this.events.publish("partners.OfferRedeemed", {
          offerId,
          redemptionId: redemption.id,
          userId,
          targetType: offer.target.type,
          targetId: offer.target.id,
        });
      }
      return ok({ redemption, created });
    }
    throw new Error("Não foi possível gerar um código de resgate único.");
  }
}
