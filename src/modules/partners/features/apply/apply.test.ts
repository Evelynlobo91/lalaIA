import { describe, expect, it, vi } from "vitest";
import { isValidCnpj } from "../../domain/cnpj";
import type { PartnerApplication, PartnerRepository } from "../../domain/partner";
import { ApprovePartner, RejectPartner, rejectSchema } from "../review/review.use-cases";
import { applySchema } from "./apply.schema";
import { SubmitPartnerApplication } from "./apply.use-case";

const valid = {
  kind: "estabelecimento",
  businessName: "  Bar do Zé  ",
  phone: "(47) 99999-0000",
  instagram: "https://www.instagram.com/bardoze/",
  cnpj: "11.222.333/0001-81",
  description: "Bar com música ao vivo no centro de Joinville.",
};

const application = (patch: Partial<PartnerApplication> = {}): PartnerApplication => ({
  id: "p1",
  ownerId: "u1",
  kind: "estabelecimento",
  businessName: "Bar do Zé",
  phone: "47999990000",
  instagram: "bardoze",
  cnpj: null,
  description: "x".repeat(20),
  status: "pending",
  rejectionReason: null,
  createdAt: new Date(),
  ...patch,
});

const repo = (patch: Partial<PartnerRepository> = {}): PartnerRepository => ({
  findByOwner: vi.fn().mockResolvedValue(null),
  submit: vi.fn().mockImplementation(async () => application()),
  listForReview: vi.fn().mockResolvedValue([]),
  review: vi.fn().mockResolvedValue(application({ status: "approved" })),
  ...patch,
});

describe("CNPJ", () => {
  it.each(["11.222.333/0001-81", "11222333000181"])("válido: %s", (v) => expect(isValidCnpj(v)).toBe(true));
  it.each(["11.222.333/0001-82", "00000000000000", "123"])("inválido: %s", (v) => expect(isValidCnpj(v)).toBe(false));
});

describe("applySchema", () => {
  it("normaliza telefone, Instagram (link ou @) e CNPJ para gravar", () => {
    expect(applySchema.parse(valid)).toEqual({
      kind: "estabelecimento",
      businessName: "Bar do Zé",
      phone: "47999990000",
      instagram: "bardoze",
      cnpj: "11222333000181",
      description: "Bar com música ao vivo no centro de Joinville.",
    });
  });

  it("campos opcionais vazios viram null", () => {
    expect(applySchema.parse({ ...valid, instagram: "", cnpj: "" })).toMatchObject({ instagram: null, cnpj: null });
  });

  it.each([
    ["tipo", { kind: "influencer" }],
    ["telefone sem DDD", { phone: "9999-0000" }],
    ["CNPJ inválido", { cnpj: "11.222.333/0001-82" }],
    ["Instagram com espaço", { instagram: "bar do ze" }],
    ["descrição curta", { description: "Bar." }],
  ])("recusa %s", (_, patch) => {
    expect(applySchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("SubmitPartnerApplication", () => {
  it("envia o cadastro do próprio usuário", async () => {
    const partners = repo();
    const input = applySchema.parse(valid);
    expect((await new SubmitPartnerApplication(partners).execute("u1", input)).ok).toBe(true);
    expect(partners.submit).toHaveBeenCalledWith("u1", input);
  });

  it("quem já é parceiro aprovado não reenvia", async () => {
    const partners = repo({ findByOwner: vi.fn().mockResolvedValue(application({ status: "approved" })) });
    const res = await new SubmitPartnerApplication(partners).execute("u1", applySchema.parse(valid));
    expect(!res.ok && res.error.code).toBe("already_partner");
    expect(partners.submit).not.toHaveBeenCalled();
  });
});

describe("ApprovePartner / RejectPartner", () => {
  const admin = { id: "admin", isAdmin: true };
  const events = () => ({ publish: vi.fn().mockResolvedValue(undefined) });

  it("aprovar concede o papel de parceiro ao dono e publica o evento", async () => {
    const roles = { grantPartner: vi.fn().mockResolvedValue(undefined) };
    const bus = events();
    const res = await new ApprovePartner(repo(), roles, bus).execute(admin, "p1");

    expect(res.ok).toBe(true);
    expect(roles.grantPartner).toHaveBeenCalledWith("u1", "admin");
    expect(bus.publish).toHaveBeenCalledWith("partners.PartnerApproved", { partnerId: "p1", userId: "u1" });
  });

  it("quem não é admin não aprova nem recusa (sem tocar no banco)", async () => {
    const partners = repo();
    const roles = { grantPartner: vi.fn() };
    expect((await new ApprovePartner(partners, roles, events()).execute({ id: "u2", isAdmin: false }, "p1")).ok).toBe(false);
    expect((await new RejectPartner(partners).execute({ id: "u2", isAdmin: false }, "p1", "motivo qualquer")).ok).toBe(false);
    expect(partners.review).not.toHaveBeenCalled();
    expect(roles.grantPartner).not.toHaveBeenCalled();
  });

  it("cadastro inexistente → não encontrado, sem conceder papel", async () => {
    const roles = { grantPartner: vi.fn() };
    const res = await new ApprovePartner(repo({ review: vi.fn().mockResolvedValue(null) }), roles, events()).execute(admin, "p1");
    expect(!res.ok && res.error.code).toBe("not_found");
    expect(roles.grantPartner).not.toHaveBeenCalled();
  });

  it("recusa exige motivo", () => {
    expect(rejectSchema.safeParse({ partnerId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f", reason: "" }).success).toBe(false);
  });
});
