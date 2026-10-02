import { describe, expect, it, vi } from "vitest";
import { ok, err, ConflictError } from "@/shared/kernel";
import { inviteStatus, type InviteRecord, type PartnerActivator } from "../../domain/conversion";
import type { Lead, LeadStage } from "../../domain/lead";
import { AcceptInvite, GetInvite, StartConversion, startConversionSchema, tokenSchema } from "./convert-lead.use-cases";

const LEAD = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";
const PLACE = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const TOKEN = "A".repeat(43);
const now = new Date("2026-10-02T12:00:00Z");
const writer = { id: "ana", canRead: true, canWrite: true };

const lead = (stage: LeadStage): Lead => ({
  id: LEAD,
  businessName: "Bar do Zé",
  contactName: "José",
  contactPhone: "47999990000",
  contactEmail: null,
  source: "visita",
  ownerId: "ana",
  stage,
  lostReason: stage === "perdido" ? "Sem interesse" : null,
  createdAt: now,
  updatedAt: now,
});

const data = { kind: "estabelecimento" as const, phone: "47999990000", description: "Bar com música ao vivo no centro de Joinville.", placeId: null };

const invite = (patch: Partial<InviteRecord> = {}): InviteRecord => ({
  id: "i1",
  leadId: LEAD,
  businessName: "Bar do Zé",
  createdBy: "ana",
  expiresAt: new Date("2026-10-16T12:00:00Z"),
  revokedAt: null,
  acceptedAt: null,
  acceptedBy: null,
  ...data,
  ...patch,
});

const tokens = { generate: vi.fn().mockReturnValue({ token: TOKEN, hash: "h".repeat(64) }), hash: vi.fn().mockReturnValue("h".repeat(64)) };

describe("startConversionSchema e token", () => {
  it("normaliza o telefone, exige descrição e aceita lugar vazio", () => {
    const parsed = startConversionSchema.parse({ leadId: LEAD, kind: "promotor", phone: "(47) 99999-0000", description: "  Produz festas e shows em Joinville.  ", placeId: "" });
    expect(parsed).toEqual({ leadId: LEAD, data: { kind: "promotor", phone: "47999990000", description: "Produz festas e shows em Joinville.", placeId: null } });
    expect(startConversionSchema.parse({ leadId: LEAD, kind: "promotor", phone: "47999990000", description: "x".repeat(20), placeId: PLACE }).data.placeId).toBe(PLACE);
    expect(startConversionSchema.safeParse({ leadId: LEAD, kind: "promotor", phone: "47999990000", description: "curta" }).success).toBe(false);
    expect(startConversionSchema.safeParse({ leadId: LEAD, kind: "outro", phone: "47999990000", description: "x".repeat(20) }).success).toBe(false);
  });

  it("token tem o formato exato do que é gerado (43 caracteres base64url)", () => {
    expect(tokenSchema.safeParse(TOKEN).success).toBe(true);
    expect(tokenSchema.safeParse("curto").success).toBe(false);
    expect(tokenSchema.safeParse(`${"A".repeat(42)}/`).success).toBe(false);
  });
});

describe("situação do convite", () => {
  it("aceito, revogado, vencido e válido", () => {
    expect(inviteStatus(invite(), now)).toBe("valid");
    expect(inviteStatus(invite({ expiresAt: now }), now)).toBe("expired");
    expect(inviteStatus(invite({ revokedAt: now }), now)).toBe("revoked");
    expect(inviteStatus(invite({ acceptedAt: now, revokedAt: now }), now)).toBe("accepted");
  });
});

describe("StartConversion", () => {
  const start = (current: Lead | null, created: { id: string } | null = { id: "i1" }) => {
    const leads = { findById: vi.fn().mockResolvedValue(current) };
    const invites = { create: vi.fn().mockResolvedValue(created) };
    return { leads, invites, useCase: new StartConversion(leads, invites, tokens, () => now) };
  };

  it("gera o convite com validade de 14 dias e devolve o token (só o hash é guardado)", async () => {
    const { invites, useCase } = start(lead("proposta"));
    const result = await useCase.execute(writer, LEAD, data);
    expect(result).toEqual({ ok: true, value: { token: TOKEN, expiresAt: new Date("2026-10-16T12:00:00Z") } });
    expect(invites.create).toHaveBeenCalledWith("ana", LEAD, "h".repeat(64), data, new Date("2026-10-16T12:00:00Z"));
  });

  it("lead ativo ou perdido não gera convite", async () => {
    const ativo = start(lead("ativo"));
    const r1 = await ativo.useCase.execute(writer, LEAD, data);
    expect(!r1.ok && r1.error.code).toBe("lead_already_converted");

    const perdido = start(lead("perdido"));
    const r2 = await perdido.useCase.execute(writer, LEAD, data);
    expect(!r2.ok && r2.error.code).toBe("lead_lost");
    expect(perdido.invites.create).not.toHaveBeenCalled();
  });

  it("quem só lê não converte; lead inexistente → não encontrado", async () => {
    const { leads, useCase } = start(lead("lead"));
    expect((await useCase.execute({ id: "bia", canRead: true, canWrite: false }, LEAD, data)).ok).toBe(false);
    expect(leads.findById).not.toHaveBeenCalled();
    const none = await start(null).useCase.execute(writer, LEAD, data);
    expect(!none.ok && none.error.code).toBe("not_found");
  });
});

describe("GetInvite", () => {
  it("mostra o nome do negócio e a situação; token desconhecido ou malformado → não encontrado", async () => {
    const invites = { findByTokenHash: vi.fn().mockResolvedValueOnce(invite()).mockResolvedValueOnce(null) };
    const useCase = new GetInvite(invites, tokens, () => now);
    expect(await useCase.execute(TOKEN)).toEqual({ ok: true, value: { status: "valid", businessName: "Bar do Zé" } });
    expect((await useCase.execute(TOKEN)).ok).toBe(false);
    expect((await useCase.execute("../etc/passwd")).ok).toBe(false);
    expect(invites.findByTokenHash).toHaveBeenCalledTimes(2);
  });
});

describe("AcceptInvite", () => {
  type Activation = Awaited<ReturnType<PartnerActivator["activate"]>>;
  const accept = (found: InviteRecord | null, activation: Activation = ok({ partnerId: "p1", alreadyActive: false, placeLinked: false })) => {
    const invites = { findByTokenHash: vi.fn().mockResolvedValue(found), markAccepted: vi.fn().mockResolvedValue(true) };
    const partners = { activate: vi.fn().mockResolvedValue(activation) };
    return { invites, partners, useCase: new AcceptInvite(invites, tokens, partners, () => now) };
  };

  it("ativa o parceiro com os dados do lead e marca o convite como aceito", async () => {
    const { invites, partners, useCase } = accept(invite({ placeId: PLACE }));
    const result = await useCase.execute("dona", TOKEN);

    expect(result).toEqual({ ok: true, value: { partnerId: "p1" } });
    expect(partners.activate).toHaveBeenCalledWith({ userId: "dona", activatedBy: "ana", businessName: "Bar do Zé", ...data, placeId: PLACE });
    expect(invites.markAccepted).toHaveBeenCalledWith("i1", "dona", "p1");
  });

  it("vencido, revogado ou usado por outra conta: recusa sem ativar ninguém", async () => {
    for (const [patch, code] of [
      [{ expiresAt: now }, "invite_expired"],
      [{ revokedAt: now }, "invite_revoked"],
      [{ acceptedAt: now, acceptedBy: "outra" }, "invite_accepted"],
    ] as const) {
      const { partners, useCase } = accept(invite(patch));
      const result = await useCase.execute("dona", TOKEN);
      expect(!result.ok && result.error.code).toBe(code);
      expect(partners.activate).not.toHaveBeenCalled();
    }
  });

  it("a mesma conta abrindo o link de novo não cria um segundo parceiro", async () => {
    const { partners, invites, useCase } = accept(invite({ acceptedAt: now, acceptedBy: "dona" }));
    expect((await useCase.execute("dona", TOKEN)).ok).toBe(true);
    expect(partners.activate).not.toHaveBeenCalled();
    expect(invites.markAccepted).not.toHaveBeenCalled();
  });

  it("se a ativação falhar (ex.: cadastro suspenso), o convite continua em aberto", async () => {
    const { invites, useCase } = accept(invite(), err(new ConflictError("Cadastro suspenso.")));
    const result = await useCase.execute("dona", TOKEN);
    expect(!result.ok && result.error.code).toBe("conflict");
    expect(invites.markAccepted).not.toHaveBeenCalled();
  });

  it("convite cuja pessoa que gerou saiu (conta excluída) não vale mais", async () => {
    const { partners, useCase } = accept(invite({ createdBy: null }));
    const result = await useCase.execute("dona", TOKEN);
    expect(!result.ok && result.error.code).toBe("invite_revoked");
    expect(partners.activate).not.toHaveBeenCalled();
  });

  it("token malformado nem consulta o banco", async () => {
    const { invites, useCase } = accept(null);
    expect((await useCase.execute("dona", "x")).ok).toBe(false);
    expect(invites.findByTokenHash).not.toHaveBeenCalled();
  });
});
