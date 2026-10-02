import { describe, expect, it, vi } from "vitest";
import { aRedemption, anOffer, fakeBus, fakeOffers, fakeRedemptions, fakeTargets, ids, now } from "../offers.fakes";
import { MyRedemptions, OffersForTarget } from "./offer-views";
import { RedeemOffer } from "./redeem-offer.use-case";

const noPartner = async () => null;

function setup(offer = anOffer(), partnerIdOf: (u: string) => Promise<string | null> = noPartner) {
  const offers = fakeOffers(offer);
  const redemptions = fakeRedemptions();
  const bus = fakeBus();
  const codes = ["ABCD2345", "EFGH6789", "JKMN2345"];
  const useCase = new RedeemOffer(offers, redemptions, partnerIdOf, bus, () => now, () => codes.shift()!);
  return { offers, redemptions, bus, useCase };
}

describe("RedeemOffer", () => {
  it("resgata, devolve o código e publica partners.OfferRedeemed", async () => {
    const { redemptions, bus, useCase } = setup();
    const result = await useCase.execute(ids.explorer, ids.offer);

    expect(result.ok && result.value).toMatchObject({ created: true, redemption: { code: "ABCD2345" } });
    expect(redemptions.redeem).toHaveBeenCalledWith(ids.explorer, ids.offer, "ABCD2345");
    expect(bus.publish).toHaveBeenCalledWith("partners.OfferRedeemed", {
      offerId: ids.offer,
      redemptionId: "r1",
      userId: ids.explorer,
      targetType: "place",
      targetId: ids.place,
    });
  });

  it("é idempotente: quem já resgatou recebe o mesmo código e nada é publicado", async () => {
    const { redemptions, bus, useCase } = setup(anOffer({ redeemedCount: 10 }));
    redemptions.findMine.mockResolvedValue(aRedemption({ code: "ZZZZ2222" }));
    const result = await useCase.execute(ids.explorer, ids.offer);
    expect(result.ok && result.value).toMatchObject({ created: false, redemption: { code: "ZZZZ2222" } });
    expect(redemptions.redeem).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("corrida da mesma pessoa (o banco devolve o resgate existente): não publica de novo", async () => {
    const { redemptions, bus, useCase } = setup();
    redemptions.redeem.mockResolvedValue({ kind: "redeemed", redemption: aRedemption(), created: false });
    expect((await useCase.execute(ids.explorer, ids.offer)).ok).toBe(true);
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it.each([
    [anOffer({ startsAt: new Date("2026-10-11T00:00:00Z") }), "offer_upcoming"],
    [anOffer({ endsAt: now }), "offer_expired"],
    [anOffer({ redeemedCount: 10 }), "offer_sold_out"],
    [anOffer({ status: "ended" }), "offer_ended"],
  ])("oferta indisponível não é resgatada (%#)", async (offer, code) => {
    const { redemptions, useCase } = setup(offer);
    const result = await useCase.execute(ids.explorer, ids.offer);
    expect(!result.ok && result.error.code).toBe(code);
    expect(redemptions.redeem).not.toHaveBeenCalled();
  });

  it("esgotou no meio (limite garantido pelo banco)", async () => {
    const { redemptions, bus, useCase } = setup();
    redemptions.redeem.mockResolvedValue({ kind: "sold_out" });
    const result = await useCase.execute(ids.explorer, ids.offer);
    expect(!result.ok && result.error.code).toBe("offer_sold_out");
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("código já existente: sorteia outro", async () => {
    const { redemptions, useCase } = setup();
    redemptions.redeem.mockResolvedValueOnce({ kind: "code_taken" });
    const result = await useCase.execute(ids.explorer, ids.offer);
    expect(result.ok && result.value.redemption.code).toBe("EFGH6789");
    expect(redemptions.redeem).toHaveBeenCalledTimes(2);
  });

  it("o parceiro não resgata a própria oferta", async () => {
    const { redemptions, useCase } = setup(anOffer(), async () => ids.partner);
    const result = await useCase.execute(ids.partnerUser, ids.offer);
    expect(!result.ok && result.error.code).toBe("own_offer");
    expect(redemptions.redeem).not.toHaveBeenCalled();
  });

  it("oferta inexistente → 404", async () => {
    const { useCase, offers } = setup();
    offers.findById.mockResolvedValue(null);
    expect((await useCase.execute(ids.explorer, ids.offer)).ok).toBe(false);
  });
});

describe("OffersForTarget", () => {
  it("mostra disponibilidade, restantes e o código de quem já resgatou", async () => {
    const offers = fakeOffers(anOffer({ redeemedCount: 4 }));
    const redemptions = fakeRedemptions();
    redemptions.findMineFor.mockResolvedValue([aRedemption()]);
    const [card] = await new OffersForTarget(offers, redemptions, noPartner, () => now).execute({ type: "place", id: ids.place }, ids.explorer);
    expect(card).toMatchObject({ availability: "available", remaining: 6, own: false, myRedemption: { code: "ABCD2345" } });
  });

  it("visitante: sem consulta de resgates; dono: marcado como própria", async () => {
    const redemptions = fakeRedemptions();
    const [visitor] = await new OffersForTarget(fakeOffers(), redemptions, noPartner, () => now).execute({ type: "place", id: ids.place }, null);
    expect(visitor.myRedemption).toBeNull();
    expect(redemptions.findMineFor).not.toHaveBeenCalled();

    const [owner] = await new OffersForTarget(fakeOffers(), fakeRedemptions(), async () => ids.partner, () => now).execute({ type: "place", id: ids.place }, ids.partnerUser);
    expect(owner.own).toBe(true);
  });
});

describe("MyRedemptions", () => {
  it("lista os códigos com o lugar e a situação (válido, usado, expirado)", async () => {
    const redemptions = fakeRedemptions();
    redemptions.listMine.mockResolvedValue([
      { ...aRedemption({ id: "a" }), offer: anOffer() },
      { ...aRedemption({ id: "b", validatedAt: now }), offer: anOffer() },
      { ...aRedemption({ id: "c" }), offer: anOffer({ endsAt: new Date("2026-10-01") }) },
    ]);
    const items = await new MyRedemptions(redemptions, fakeTargets(), () => now).execute(ids.explorer);
    expect(items.map((i) => i.status)).toEqual(["valid", "validated", "expired"]);
    expect(items[0].target).toEqual({ type: "place", id: ids.place, name: "Café Centro", href: `/lugares/${ids.place}` });
  });

  it("sem resgates não consulta nomes", async () => {
    const targets = fakeTargets();
    expect(await new MyRedemptions(fakeRedemptions(), targets, () => now).execute(ids.explorer)).toEqual([]);
    expect(vi.mocked(targets.names)).not.toHaveBeenCalled();
  });
});
