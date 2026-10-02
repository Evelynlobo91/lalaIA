import { describe, expect, it } from "vitest";
import { aRedemption, anOffer, fakeBus, fakeRedemptions, ids, now } from "../offers.fakes";
import { ValidateOfferCode } from "./validate-code.use-case";

const author = { userId: ids.partnerUser, partnerId: ids.partner };

function setup() {
  const redemptions = fakeRedemptions();
  const bus = fakeBus();
  return { redemptions, bus, useCase: new ValidateOfferCode(redemptions, bus, () => now) };
}

describe("ValidateOfferCode", () => {
  it("valida o código da própria oferta uma vez e publica partners.OfferValidated", async () => {
    const { redemptions, bus, useCase } = setup();
    redemptions.findForPartner.mockResolvedValue({ ...aRedemption(), offer: anOffer() });

    const result = await useCase.execute(author, "abcd-2345");
    expect(result.ok && result.value).toMatchObject({ code: "ABCD2345", offerTitle: "10% no café", validatedAt: now });
    expect(redemptions.findForPartner).toHaveBeenCalledWith(ids.partnerUser, ids.partner, "ABCD2345");
    expect(redemptions.markValidated).toHaveBeenCalledWith(ids.partnerUser, "r1");
    expect(bus.publish).toHaveBeenCalledWith("partners.OfferValidated", {
      offerId: ids.offer,
      redemptionId: "r1",
      userId: ids.explorer,
      validatedBy: ids.partnerUser,
      targetType: "place",
      targetId: ids.place,
    });
  });

  it("código de outra oferta/parceiro e código inexistente recebem a mesma resposta", async () => {
    const { redemptions, useCase } = setup();
    // O repositório só encontra resgates das ofertas do parceiro: para ele, o código de outro parceiro não existe.
    redemptions.findForPartner.mockResolvedValue(null);
    const other = await useCase.execute(author, "WXYZ2345");
    const malformed = await useCase.execute(author, "0000-OOOO");
    expect(!other.ok && other.error).toMatchObject({ code: "invalid_code", message: "Código inválido." });
    expect(!malformed.ok && malformed.error).toMatchObject({ code: "invalid_code", message: "Código inválido." });
  });

  it("vale uma vez só (já validado, ou validado ao mesmo tempo por outra pessoa)", async () => {
    const { redemptions, bus, useCase } = setup();
    redemptions.findForPartner.mockResolvedValue({ ...aRedemption({ validatedAt: now }), offer: anOffer() });
    const used = await useCase.execute(author, "ABCD2345");
    expect(!used.ok && used.error.code).toBe("code_used");

    redemptions.findForPartner.mockResolvedValue({ ...aRedemption(), offer: anOffer() });
    redemptions.markValidated.mockResolvedValue(null);
    const race = await useCase.execute(author, "ABCD2345");
    expect(!race.ok && race.error.code).toBe("code_used");
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("não vale depois do fim da oferta", async () => {
    const { redemptions, useCase } = setup();
    redemptions.findForPartner.mockResolvedValue({ ...aRedemption(), offer: anOffer({ endsAt: now }) });
    const result = await useCase.execute(author, "ABCD2345");
    expect(!result.ok && result.error.code).toBe("code_expired");
    expect(redemptions.markValidated).not.toHaveBeenCalled();
  });

  it("oferta encerrada antes do fim: códigos já emitidos ainda valem", async () => {
    const { redemptions, useCase } = setup();
    redemptions.findForPartner.mockResolvedValue({ ...aRedemption(), offer: anOffer({ status: "ended" }) });
    expect((await useCase.execute(author, "ABCD2345")).ok).toBe(true);
  });
});
