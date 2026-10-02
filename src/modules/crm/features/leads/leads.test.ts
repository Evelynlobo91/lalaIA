import { describe, expect, it, vi } from "vitest";
import type { Lead, LeadData } from "../../domain/lead";
import { leadSchema } from "./leads.schema";
import { GetLead, LEADS_LIST_LIMIT, ListLeads, SaveLead } from "./leads.use-cases";

const OWNER = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const LEAD = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";

const form = (patch: Record<string, string> = {}) => ({
  businessName: "  Bar do Zé  ",
  contactName: "José",
  contactPhone: "(47) 99999-0000",
  contactEmail: " Ze@Exemplo.com ",
  source: "instagram",
  ownerId: OWNER,
  ...patch,
});

const data: LeadData = { businessName: "Bar do Zé", contactName: "José", contactPhone: "47999990000", contactEmail: null, source: "visita", ownerId: OWNER };
const lead = (patch: Partial<Lead> = {}): Lead => ({ ...data, id: LEAD, stage: "lead", lostReason: null, createdAt: new Date(), updatedAt: new Date(), ...patch });

const writer = { id: "ana", canRead: true, canWrite: true };
const reader = { id: "bia", canRead: true, canWrite: false };
const outsider = { id: "x", canRead: false, canWrite: false };
const owners = { list: vi.fn().mockResolvedValue([{ id: OWNER, name: "Ana Comercial" }]) };

describe("leadSchema", () => {
  it("normaliza: apara o nome, telefone só com dígitos, e-mail em minúsculas", () => {
    expect(leadSchema.parse(form())).toEqual({
      leadId: undefined,
      data: { businessName: "Bar do Zé", contactName: "José", contactPhone: "47999990000", contactEmail: "ze@exemplo.com", source: "instagram", ownerId: OWNER },
    });
  });

  it("aceita só telefone ou só e-mail, mas exige pelo menos um", () => {
    expect(leadSchema.parse(form({ contactEmail: "" })).data.contactEmail).toBeNull();
    expect(leadSchema.parse(form({ contactPhone: "" })).data.contactPhone).toBeNull();
    const none = leadSchema.safeParse(form({ contactPhone: "", contactEmail: "" }));
    expect(!none.success && none.error.issues[0]).toMatchObject({ path: ["contactPhone"], message: "Informe um telefone ou um e-mail do contato." });
  });

  it("recusa telefone sem DDD, e-mail inválido, origem desconhecida e responsável que não é id", () => {
    expect(leadSchema.safeParse(form({ contactPhone: "9999-0000" })).success).toBe(false);
    expect(leadSchema.safeParse(form({ contactEmail: "ze@" })).success).toBe(false);
    expect(leadSchema.safeParse(form({ source: "tiktok" })).success).toBe(false);
    expect(leadSchema.safeParse(form({ ownerId: "ana" })).success).toBe(false);
  });

  it("na edição carrega o id do lead", () => {
    expect(leadSchema.parse(form({ leadId: LEAD })).leadId).toBe(LEAD);
  });
});

describe("SaveLead", () => {
  it("cria com quem está agindo como autor (RLS)", async () => {
    const leads = { create: vi.fn().mockResolvedValue(lead()), update: vi.fn() };
    const result = await new SaveLead(leads, owners).execute(writer, undefined, data);
    expect(result.ok).toBe(true);
    expect(leads.create).toHaveBeenCalledWith("ana", data);
  });

  it("edita um lead existente; inexistente → não encontrado", async () => {
    const leads = { create: vi.fn(), update: vi.fn().mockResolvedValueOnce(lead({ businessName: "Bar Novo" })).mockResolvedValueOnce(null) };
    expect((await new SaveLead(leads, owners).execute(writer, LEAD, data)).ok).toBe(true);
    const missing = await new SaveLead(leads, owners).execute(writer, LEAD, data);
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });

  it("quem só lê não grava, e não chega ao banco", async () => {
    const leads = { create: vi.fn(), update: vi.fn() };
    const result = await new SaveLead(leads, owners).execute(reader, undefined, data);
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(leads.create).not.toHaveBeenCalled();
  });

  it("responsável precisa ser alguém do time comercial", async () => {
    const leads = { create: vi.fn(), update: vi.fn() };
    const result = await new SaveLead(leads, owners).execute(writer, undefined, { ...data, ownerId: "0d2e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b92" });
    expect(!result.ok && result.error.code).toBe("validation_failed");
    expect(leads.create).not.toHaveBeenCalled();
  });
});

describe("ListLeads / GetLead", () => {
  it("lista com o nome do responsável; quem saiu do time e conta excluída têm rótulo próprio", async () => {
    const leads = { list: vi.fn().mockResolvedValue([lead(), lead({ id: "outro", ownerId: "saiu" }), lead({ id: "orfao", ownerId: null })]) };
    const result = await new ListLeads(leads, owners).execute(reader);
    expect(leads.list).toHaveBeenCalledWith("bia", LEADS_LIST_LIMIT);
    expect(result.ok && result.value.map((l) => l.ownerName)).toEqual(["Ana Comercial", "Fora do time", "Sem responsável"]);
  });

  it("quem não tem acesso ao CRM não lista nem abre lead", async () => {
    const leads = { list: vi.fn(), findById: vi.fn() };
    expect((await new ListLeads(leads, owners).execute(outsider)).ok).toBe(false);
    expect((await new GetLead(leads).execute(outsider, LEAD)).ok).toBe(false);
    expect(leads.list).not.toHaveBeenCalled();
    expect(leads.findById).not.toHaveBeenCalled();
  });

  it("abre um lead; inexistente → não encontrado", async () => {
    const leads = { findById: vi.fn().mockResolvedValueOnce(lead()).mockResolvedValueOnce(null) };
    expect((await new GetLead(leads).execute(reader, LEAD)).ok).toBe(true);
    const missing = await new GetLead(leads).execute(reader, LEAD);
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });
});
