import { describe, expect, it } from "vitest";
import { anOffer, fakeOffers, fakeTargets, ids, now } from "../offers.fakes";
import { EndOffer, SaveOffer } from "./manage-offers.use-cases";
import { editableOffer } from "./partner-offers";
import { offerSchema } from "./offer.schema";

const author = { userId: ids.partnerUser, partnerId: ids.partner };
const draft = {
  target: { type: "place" as const, id: ids.place },
  title: "10% no café",
  description: "Desconto em qualquer café da casa.",
  startsAt: new Date("2026-10-11T00:00:00Z"),
  endsAt: new Date("2026-10-20T00:00:00Z"),
  maxRedemptions: 50,
};

describe("offerSchema", () => {
  const form = {
    target: `place:${ids.place}`,
    title: "10% no café",
    description: "Desconto em qualquer café da casa.",
    startsAt: "2026-10-11T08:00",
    endsAt: "2026-10-20T22:00",
    maxRedemptions: "",
  };

  it("converte o horário de Joinville, o alvo e o limite vazio (sem limite)", () => {
    const parsed = offerSchema.parse(form);
    expect(parsed.draft.target).toEqual({ type: "place", id: ids.place });
    expect(parsed.draft.startsAt.toISOString()).toBe("2026-10-11T11:00:00.000Z");
    expect(parsed.draft.maxRedemptions).toBeNull();
    expect(offerSchema.parse({ ...form, maxRedemptions: "30" }).draft.maxRedemptions).toBe(30);
  });

  it.each([
    [{ target: "mission:" + ids.place }, "target"],
    [{ target: "place:../../etc" }, "target"],
    [{ title: "x" }, "title"],
    [{ description: "curta" }, "description"],
    [{ endsAt: "2026-10-10T08:00" }, "endsAt"],
    [{ endsAt: "2027-12-01T08:00" }, "endsAt"],
    [{ maxRedemptions: "0" }, "maxRedemptions"],
    [{ maxRedemptions: "2.5" }, "maxRedemptions"],
    [{ startsAt: "amanhã" }, "startsAt"],
  ])("recusa %o", (patch, field) => {
    const result = offerSchema.safeParse({ ...form, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });
});

describe("SaveOffer", () => {
  it("cria oferta num lugar que o parceiro gerencia", async () => {
    const offers = fakeOffers();
    const result = await new SaveOffer(offers, fakeTargets(), () => now).execute(author, undefined, draft);
    expect(result.ok).toBe(true);
    expect(offers.create).toHaveBeenCalledWith(ids.partnerUser, ids.partner, draft);
  });

  it("recusa lugar/evento que não é do parceiro (posse pelas APIs de places e events)", async () => {
    const offers = fakeOffers();
    const result = await new SaveOffer(offers, fakeTargets([{ type: "event", id: ids.event, name: "Show" }]), () => now).execute(author, undefined, draft);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details).toEqual([{ path: ["target"], message: expect.stringContaining("gerencia") }]);
    expect(offers.create).not.toHaveBeenCalled();
  });

  it("um evento com o mesmo id de um lugar do parceiro não passa (tipo + id)", async () => {
    const result = await new SaveOffer(fakeOffers(), fakeTargets(), () => now).execute(author, undefined, { ...draft, target: { type: "event", id: ids.place } });
    expect(result.ok).toBe(false);
  });

  it("não cria oferta que já terminou", async () => {
    const result = await new SaveOffer(fakeOffers(), fakeTargets(), () => now).execute(author, undefined, { ...draft, startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-02") });
    expect(!result.ok && result.error.code).toBe("validation_failed");
  });

  it("edita enquanto ninguém resgatou", async () => {
    const offers = fakeOffers(anOffer());
    const result = await new SaveOffer(offers, fakeTargets(), () => now).execute(author, ids.offer, draft);
    expect(result.ok).toBe(true);
    expect(offers.update).toHaveBeenCalledWith(ids.partnerUser, ids.offer, draft);
  });

  it("não edita depois do primeiro resgate, nem oferta encerrada", async () => {
    const locked = await new SaveOffer(fakeOffers(anOffer({ redeemedCount: 1 })), fakeTargets(), () => now).execute(author, ids.offer, draft);
    expect(!locked.ok && locked.error.code).toBe("offer_locked");
    const ended = await new SaveOffer(fakeOffers(anOffer({ status: "ended" })), fakeTargets(), () => now).execute(author, ids.offer, draft);
    expect(!ended.ok && ended.error.code).toBe("offer_ended");
  });

  it("resgate entre a leitura e a gravação: o trigger do banco recusa e vira offer_locked", async () => {
    const offers = fakeOffers(anOffer());
    offers.update.mockRejectedValue(Object.assign(new Error("oferta já resgatada"), { code: "23514" }));
    const result = await new SaveOffer(offers, fakeTargets(), () => now).execute(author, ids.offer, draft);
    expect(!result.ok && result.error.code).toBe("offer_locked");
  });

  it("oferta de outro parceiro responde como inexistente", async () => {
    const result = await new SaveOffer(fakeOffers(anOffer({ partnerId: ids.otherPartner })), fakeTargets(), () => now).execute(author, ids.offer, draft);
    expect(!result.ok && result.error.code).toBe("not_found");
  });
});

describe("EndOffer", () => {
  it("encerra a própria oferta e é idempotente", async () => {
    const offers = fakeOffers(anOffer());
    expect((await new EndOffer(offers).execute(author, ids.offer)).ok).toBe(true);
    expect(offers.end).toHaveBeenCalledWith(ids.partnerUser, ids.offer);

    const already = fakeOffers(anOffer({ status: "ended" }));
    expect((await new EndOffer(already).execute(author, ids.offer)).ok).toBe(true);
    expect(already.end).not.toHaveBeenCalled();
  });

  it("não encerra oferta de outro parceiro", async () => {
    const offers = fakeOffers(anOffer({ partnerId: ids.otherPartner }));
    const result = await new EndOffer(offers).execute(author, ids.offer);
    expect(!result.ok && result.error.code).toBe("not_found");
    expect(offers.end).not.toHaveBeenCalled();
  });
});

describe("editableOffer", () => {
  it("devolve os valores do formulário só para o dono e enquanto ninguém resgatou", async () => {
    const values = await editableOffer(fakeOffers(anOffer({ maxRedemptions: null })), author, ids.offer);
    expect(values).toMatchObject({ offerId: ids.offer, target: `place:${ids.place}`, maxRedemptions: "", startsAt: "2026-10-09T21:00" });
    expect(await editableOffer(fakeOffers(anOffer({ redeemedCount: 2 })), author, ids.offer)).toBeNull();
    expect(await editableOffer(fakeOffers(anOffer({ partnerId: ids.otherPartner })), author, ids.offer)).toBeNull();
    expect(await editableOffer(fakeOffers(), author, "não-é-uuid")).toBeNull();
  });
});
