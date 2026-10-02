import { toLocalInput } from "@/shared/time/joinville-time";
import { availabilityOf, targetKey, type Offer, type OfferAvailability, type OfferRepository, type OfferTargets } from "../../domain/offer";
import type { OfferAuthor } from "./manage-offers.use-cases";

export type PartnerOfferItem = Offer & { targetName: string; validatedCount: number; availability: OfferAvailability; editable: boolean };

/** Ofertas do parceiro no portal, com o nome do lugar/evento e quantos códigos já foram usados no balcão. */
export class ListPartnerOffers {
  constructor(
    private readonly offers: OfferRepository,
    private readonly targets: OfferTargets,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(author: OfferAuthor): Promise<PartnerOfferItem[]> {
    const list = await this.offers.listByPartner(author.partnerId);
    const names = await this.targets.names(list.map((o) => o.target));
    const now = this.now();
    return list.map((o) => {
      const availability = availabilityOf(o, now);
      return {
        ...o,
        targetName: names.get(targetKey(o.target)) ?? "Indisponível",
        availability,
        editable: o.status === "active" && o.redeemedCount === 0 && availability !== "expired",
      };
    });
  }
}

export type OfferFormValues = {
  offerId?: string;
  target: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
};

/** Valores do formulário de edição; null se a oferta não for do parceiro ou não puder mais ser editada. */
export async function editableOffer(offers: OfferRepository, author: OfferAuthor, offerId: string): Promise<OfferFormValues | null> {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return null;
  const offer = await offers.findById(offerId);
  if (!offer || offer.partnerId !== author.partnerId || offer.status !== "active" || offer.redeemedCount > 0) return null;
  return {
    offerId: offer.id,
    target: targetKey(offer.target),
    title: offer.title,
    description: offer.description,
    startsAt: toLocalInput(offer.startsAt),
    endsAt: toLocalInput(offer.endsAt),
    maxRedemptions: offer.maxRedemptions === null ? "" : String(offer.maxRedemptions),
  };
}
