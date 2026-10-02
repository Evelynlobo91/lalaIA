import { availabilityOf, remainingOf, targetKey, type Offer, type OfferAvailability, type OfferRepository, type OfferTarget, type OfferTargets, type Redemption, type RedemptionRepository } from "../../domain/offer";
import type { PartnerIdOf } from "./redeem-offer.use-case";

export type OfferCard = {
  offer: Offer;
  availability: OfferAvailability;
  /** Resgates restantes (null = sem limite). */
  remaining: number | null;
  /** O resgate de quem está vendo, se já resgatou. */
  myRedemption: Redemption | null;
  /** Quem está vendo é o parceiro dono (não resgata a própria oferta). */
  own: boolean;
};

/** Ofertas vigentes (ou prestes a começar / esgotadas) de um lugar ou evento, do ponto de vista de quem vê. */
export class OffersForTarget {
  constructor(
    private readonly offers: OfferRepository,
    private readonly redemptions: RedemptionRepository,
    private readonly partnerIdOf: PartnerIdOf,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(target: OfferTarget, viewerId: string | null): Promise<OfferCard[]> {
    const now = this.now();
    const offers = await this.offers.listCurrentFor(target, now);
    if (offers.length === 0) return [];
    const [mine, partnerId] = viewerId
      ? await Promise.all([this.redemptions.findMineFor(viewerId, offers.map((o) => o.id)), this.partnerIdOf(viewerId)])
      : [[], null];
    const byOffer = new Map(mine.map((r) => [r.offerId, r]));
    return offers.map((offer) => ({
      offer,
      availability: availabilityOf(offer, now),
      remaining: remainingOf(offer),
      myRedemption: byOffer.get(offer.id) ?? null,
      own: partnerId !== null && partnerId === offer.partnerId,
    }));
  }
}

export type RedemptionStatus = "valid" | "validated" | "expired";

export type MyRedemptionItem = {
  id: string;
  code: string;
  offerTitle: string;
  offerDescription: string;
  target: OfferTarget & { name: string; href: string };
  redeemedAt: Date;
  validatedAt: Date | null;
  endsAt: Date;
  status: RedemptionStatus;
};

const hrefOf = (t: OfferTarget) => (t.type === "place" ? `/lugares/${t.id}` : `/eventos/${t.id}`);

/** "Meus resgates" (perfil e exportação LGPD): o código, a oferta e onde ela vale. */
export class MyRedemptions {
  constructor(
    private readonly redemptions: RedemptionRepository,
    private readonly targets: OfferTargets,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string): Promise<MyRedemptionItem[]> {
    const list = await this.redemptions.listMine(userId);
    if (list.length === 0) return [];
    const names = await this.targets.names(list.map((r) => r.offer.target));
    const now = this.now();
    return list.map((r) => ({
      id: r.id,
      code: r.code,
      offerTitle: r.offer.title,
      offerDescription: r.offer.description,
      target: { ...r.offer.target, name: names.get(targetKey(r.offer.target)) ?? "Indisponível", href: hrefOf(r.offer.target) },
      redeemedAt: r.redeemedAt,
      validatedAt: r.validatedAt,
      endsAt: r.offer.endsAt,
      status: r.validatedAt ? "validated" : now >= r.offer.endsAt ? "expired" : "valid",
    }));
  }
}
