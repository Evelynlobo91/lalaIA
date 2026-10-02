import { describe, expect, it, vi } from "vitest";
import { ActivatePartner, type ActivationOutcome, type PartnerActivation } from "./activate-partner";

const input = (patch: Partial<PartnerActivation> = {}): PartnerActivation => ({
  userId: "dona",
  activatedBy: "comercial",
  kind: "estabelecimento",
  businessName: "Bar do Zé",
  phone: "47999990000",
  description: "Bar com música ao vivo no centro de Joinville.",
  placeId: null,
  ...patch,
});

const deps = (outcome: ActivationOutcome, place: unknown = { id: "lugar", name: "Bar do Zé", managed: false }) => ({
  store: { activate: vi.fn().mockResolvedValue(outcome) },
  places: { summary: vi.fn().mockResolvedValue(place) },
  roles: { grantPartner: vi.fn().mockResolvedValue(undefined) },
  events: { publish: vi.fn().mockResolvedValue(undefined) },
});
const useCase = (d: ReturnType<typeof deps>) => new ActivatePartner(d.store, d.places, d.roles, d.events);

describe("ActivatePartner", () => {
  it("ativa, concede o papel e publica a aprovação com quem autorizou", async () => {
    const d = deps({ status: "activated", partnerId: "p1", claimId: null });
    const result = await useCase(d).execute(input());

    expect(result).toEqual({ ok: true, value: { partnerId: "p1", alreadyActive: false, placeLinked: false } });
    expect(d.roles.grantPartner).toHaveBeenCalledWith("dona", "comercial");
    expect(d.events.publish).toHaveBeenCalledExactlyOnceWith("partners.PartnerApproved", { partnerId: "p1", userId: "dona", approvedBy: "comercial" });
    expect(d.places.summary).not.toHaveBeenCalled();
  });

  it("com lugar: vincula e avisa o módulo places pelo evento", async () => {
    const d = deps({ status: "activated", partnerId: "p1", claimId: "c1" });
    const result = await useCase(d).execute(input({ placeId: "lugar" }));

    expect(result.ok && result.value.placeLinked).toBe(true);
    expect(d.events.publish).toHaveBeenCalledWith("partners.PlaceClaimApproved", { claimId: "c1", placeId: "lugar", userId: "dona", approvedBy: "comercial" });
  });

  it("lugar que já tem outro responsável: ativa o parceiro, sem o vínculo", async () => {
    const d = deps({ status: "activated", partnerId: "p1", claimId: null });
    const result = await useCase(d).execute(input({ placeId: "lugar" }));
    expect(result.ok && result.value).toMatchObject({ partnerId: "p1", placeLinked: false });
    expect(d.events.publish).toHaveBeenCalledTimes(1);
  });

  it("conta que já é parceira: não publica nova aprovação, mas garante o papel", async () => {
    const d = deps({ status: "already_active", partnerId: "p1", claimId: null });
    const result = await useCase(d).execute(input());
    expect(result.ok && result.value.alreadyActive).toBe(true);
    expect(d.roles.grantPartner).toHaveBeenCalled();
    expect(d.events.publish).not.toHaveBeenCalled();
  });

  it("cadastro suspenso não é reativado por aqui", async () => {
    const d = deps({ status: "suspended" });
    const result = await useCase(d).execute(input());
    expect(!result.ok && result.error.code).toBe("conflict");
    expect(d.roles.grantPartner).not.toHaveBeenCalled();
  });

  it("lugar inexistente recusa antes de gravar qualquer coisa", async () => {
    const d = deps({ status: "activated", partnerId: "p1", claimId: null }, null);
    const result = await useCase(d).execute(input({ placeId: "sumiu" }));
    expect(!result.ok && result.error.code).toBe("place_not_found");
    expect(d.store.activate).not.toHaveBeenCalled();
  });
});
