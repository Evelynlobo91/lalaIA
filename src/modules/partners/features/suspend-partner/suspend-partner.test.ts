import { describe, expect, it, vi } from "vitest";
import type { DomainEventPublisher } from "@/shared/events";
import type { PartnerApplication } from "../../domain/partner";
import { ListActivePartners, ReactivatePartner, SuspendPartner, suspendSchema } from "./suspend-partner.use-cases";

const partner = (patch: Partial<PartnerApplication> = {}): PartnerApplication => ({
  id: "p1",
  ownerId: "u1",
  kind: "estabelecimento",
  businessName: "Bar do Zé",
  phone: "47999990000",
  instagram: null,
  cnpj: null,
  description: "x".repeat(20),
  status: "approved",
  rejectionReason: null,
  suspensionReason: null,
  createdAt: new Date(),
  ...patch,
});

const admin = { id: "admin", isAdmin: true };
const notAdmin = { id: "u2", isAdmin: false };
const bus = () => ({ publish: vi.fn().mockResolvedValue(undefined) }) satisfies DomainEventPublisher;

describe("suspendSchema", () => {
  it("exige motivo com pelo menos 5 caracteres", () => {
    const id = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
    expect(suspendSchema.safeParse({ partnerId: id, reason: "  ok " }).success).toBe(false);
    expect(suspendSchema.parse({ partnerId: id, reason: "  Conteúdo irregular  " }).reason).toBe("Conteúdo irregular");
  });
});

describe("SuspendPartner", () => {
  it("suspende com motivo e publica o evento", async () => {
    const suspend = vi.fn().mockResolvedValue(partner({ status: "suspended", suspensionReason: "Conteúdo irregular" }));
    const events = bus();
    const result = await new SuspendPartner({ suspend }, events).execute(admin, "p1", "Conteúdo irregular");

    expect(result.ok && result.value.status).toBe("suspended");
    expect(suspend).toHaveBeenCalledWith("admin", "p1", "Conteúdo irregular");
    expect(events.publish).toHaveBeenCalledWith("partners.PartnerSuspended", { partnerId: "p1", userId: "u1", suspendedBy: "admin" });
  });

  it("recusa quem não é admin, sem tocar no repositório", async () => {
    const suspend = vi.fn();
    const result = await new SuspendPartner({ suspend }, bus()).execute(notAdmin, "p1", "Conteúdo irregular");
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(suspend).not.toHaveBeenCalled();
  });

  it("parceiro que não está aprovado dá conflito e não publica evento", async () => {
    const events = bus();
    const result = await new SuspendPartner({ suspend: vi.fn().mockResolvedValue(null) }, events).execute(admin, "p1", "Conteúdo irregular");
    expect(!result.ok && result.error.code).toBe("conflict");
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe("ReactivatePartner", () => {
  it("reativa e publica o evento", async () => {
    const events = bus();
    const result = await new ReactivatePartner({ reactivate: vi.fn().mockResolvedValue(partner()) }, events).execute(admin, "p1");
    expect(result.ok && result.value.status).toBe("approved");
    expect(events.publish).toHaveBeenCalledWith("partners.PartnerReactivated", { partnerId: "p1", userId: "u1", reactivatedBy: "admin" });
  });

  it("recusa quem não é admin", async () => {
    const reactivate = vi.fn();
    const result = await new ReactivatePartner({ reactivate }, bus()).execute(notAdmin, "p1");
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(reactivate).not.toHaveBeenCalled();
  });

  it("parceiro que não está suspenso dá conflito", async () => {
    const result = await new ReactivatePartner({ reactivate: vi.fn().mockResolvedValue(null) }, bus()).execute(admin, "p1");
    expect(!result.ok && result.error.code).toBe("conflict");
  });
});

describe("ListActivePartners", () => {
  it("só admin lista", async () => {
    const listActive = vi.fn().mockResolvedValue([]);
    expect((await new ListActivePartners({ listActive }).execute(notAdmin)).ok).toBe(false);
    expect(listActive).not.toHaveBeenCalled();
    expect((await new ListActivePartners({ listActive }).execute(admin)).ok).toBe(true);
  });
});
