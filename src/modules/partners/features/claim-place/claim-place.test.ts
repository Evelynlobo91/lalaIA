import { describe, expect, it, vi } from "vitest";
import type { PlaceClaim, PlaceClaimRepository } from "../../domain/place-claim";
import { ApprovePlaceClaim, RejectPlaceClaim, RequestPlaceClaim } from "./claim-place.use-cases";

const claim = (patch: Partial<PlaceClaim> = {}): PlaceClaim => ({ id: "c1", partnerId: "p1", placeId: "lugar", status: "pending", rejectionReason: null, createdAt: new Date(), ...patch });

const repo = (patch: Partial<PlaceClaimRepository> = {}): PlaceClaimRepository => ({
  request: vi.fn().mockResolvedValue(claim()),
  listMine: vi.fn().mockResolvedValue([]),
  listForReview: vi.fn().mockResolvedValue([]),
  review: vi.fn().mockResolvedValue({ ...claim({ status: "approved" }), ownerId: "dono" }),
  ...patch,
});

const lookup = (summary: { id: string; name: string; managed: boolean } | null) => ({ summary: vi.fn().mockResolvedValue(summary) });
const partner = { userId: "dono", partnerId: "p1" };
const admin = { id: "admin", isAdmin: true };

describe("RequestPlaceClaim", () => {
  it("pede o vínculo como o próprio parceiro", async () => {
    const claims = repo();
    const res = await new RequestPlaceClaim(claims, lookup({ id: "lugar", name: "Café", managed: false })).execute(partner, "lugar");
    expect(res.ok).toBe(true);
    expect(claims.request).toHaveBeenCalledWith("dono", "p1", "lugar");
  });

  it("lugar com responsável: recusa sem revelar quem é", async () => {
    const claims = repo();
    const res = await new RequestPlaceClaim(claims, lookup({ id: "lugar", name: "Café", managed: true })).execute(partner, "lugar");
    expect(!res.ok && res.error.message).toBe("Este lugar já tem um responsável. Se for seu, fale com o suporte.");
    expect(claims.request).not.toHaveBeenCalled();
  });

  it("lugar inexistente → não encontrado", async () => {
    const res = await new RequestPlaceClaim(repo(), lookup(null)).execute(partner, "lugar");
    expect(!res.ok && res.error.code).toBe("not_found");
  });
});

describe("ApprovePlaceClaim / RejectPlaceClaim", () => {
  it("aprovar publica o evento para o módulo places marcar o dono", async () => {
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    const res = await new ApprovePlaceClaim(repo(), events).execute(admin, "c1");
    expect(res.ok).toBe(true);
    expect(events.publish).toHaveBeenCalledWith("partners.PlaceClaimApproved", { claimId: "c1", placeId: "lugar", userId: "dono" });
  });

  it("segundo dono para o mesmo lugar (índice único) vira conflito, sem evento", async () => {
    const events = { publish: vi.fn() };
    const res = await new ApprovePlaceClaim(repo({ review: vi.fn().mockRejectedValue({ code: "23505" }) }), events).execute(admin, "c1");
    expect(!res.ok && res.error.code).toBe("conflict");
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("quem não é admin não revisa", async () => {
    const claims = repo();
    expect((await new ApprovePlaceClaim(claims, { publish: vi.fn() }).execute({ id: "x", isAdmin: false }, "c1")).ok).toBe(false);
    expect((await new RejectPlaceClaim(claims).execute({ id: "x", isAdmin: false }, "c1", "motivo")).ok).toBe(false);
    expect(claims.review).not.toHaveBeenCalled();
  });
});
