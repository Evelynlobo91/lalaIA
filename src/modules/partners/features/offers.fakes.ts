// Portas falsas para os testes dos casos de uso de ofertas (só usado em testes).
import { vi } from "vitest";
import type { Offer, OfferRepository, OfferTarget, OfferTargets, Redemption, RedemptionRepository } from "../domain/offer";

export const ids = {
  partner: "11111111-1111-4111-8111-111111111111",
  partnerUser: "22222222-2222-4222-8222-222222222222",
  otherPartner: "33333333-3333-4333-8333-333333333333",
  explorer: "44444444-4444-4444-8444-444444444444",
  place: "55555555-5555-4555-8555-555555555555",
  event: "66666666-6666-4666-8666-666666666666",
  offer: "77777777-7777-4777-8777-777777777777",
};

export const now = new Date("2026-10-10T15:00:00Z");

export function anOffer(patch: Partial<Offer> = {}): Offer {
  return {
    id: ids.offer,
    partnerId: ids.partner,
    target: { type: "place", id: ids.place },
    title: "10% no café",
    description: "Desconto em qualquer café da casa.",
    startsAt: new Date("2026-10-10T00:00:00Z"),
    endsAt: new Date("2026-10-20T00:00:00Z"),
    maxRedemptions: 10,
    redeemedCount: 0,
    status: "active",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...patch,
  };
}

export function aRedemption(patch: Partial<Redemption> = {}): Redemption {
  return { id: "r1", offerId: ids.offer, userId: ids.explorer, code: "ABCD2345", redeemedAt: now, validatedAt: null, ...patch };
}

export function fakeOffers(offer: Offer | null = anOffer()) {
  return {
    findById: vi.fn<OfferRepository["findById"]>().mockResolvedValue(offer),
    listCurrentFor: vi.fn<OfferRepository["listCurrentFor"]>().mockResolvedValue(offer ? [offer] : []),
    listByPartner: vi.fn<OfferRepository["listByPartner"]>().mockResolvedValue([]),
    create: vi.fn<OfferRepository["create"]>().mockImplementation(async (_a, partnerId, d) => anOffer({ ...d, partnerId })),
    update: vi.fn<OfferRepository["update"]>().mockImplementation(async (_a, id, d) => anOffer({ ...d, id })),
    end: vi.fn<OfferRepository["end"]>().mockResolvedValue(anOffer({ status: "ended" })),
  } satisfies OfferRepository;
}

export function fakeRedemptions() {
  return {
    findMine: vi.fn<RedemptionRepository["findMine"]>().mockResolvedValue(null),
    findMineFor: vi.fn<RedemptionRepository["findMineFor"]>().mockResolvedValue([]),
    listMine: vi.fn<RedemptionRepository["listMine"]>().mockResolvedValue([]),
    redeem: vi.fn<RedemptionRepository["redeem"]>().mockImplementation(async (userId, offerId, code) => ({ kind: "redeemed", redemption: aRedemption({ userId, offerId, code }), created: true })),
    findForPartner: vi.fn<RedemptionRepository["findForPartner"]>().mockResolvedValue(null),
    markValidated: vi.fn<RedemptionRepository["markValidated"]>().mockResolvedValue(aRedemption({ validatedAt: now })),
  } satisfies RedemptionRepository;
}

export function fakeTargets(owned: Array<{ type: "place" | "event"; id: string; name: string }> = [{ type: "place", id: ids.place, name: "Café Centro" }]): OfferTargets {
  return {
    ownedBy: vi.fn(async () => owned),
    names: vi.fn(async (targets: OfferTarget[]) => new Map<string, string>(targets.map((t) => [`${t.type}:${t.id}`, owned.find((o) => o.id === t.id)?.name ?? "Outro"]))),
  };
}

export const fakeBus = () => ({ publish: vi.fn().mockResolvedValue(undefined) });
