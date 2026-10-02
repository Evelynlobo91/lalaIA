import { describe, expect, it, vi } from "vitest";
import type { Lead, LeadStage } from "../../domain/lead";
import { canMove, nextStages } from "../../domain/pipeline";
import { GetLeadHistory, MoveLead, moveLeadSchema } from "./pipeline.use-cases";

const LEAD = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";
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
  createdAt: new Date(),
  updatedAt: new Date(),
});

const writer = { id: "ana", canRead: true, canWrite: true };
const reader = { id: "bia", canRead: true, canWrite: false };
const move = (from: LeadStage, to: LeadStage, reason: string | null = null) => ({ leadId: LEAD, from, to, reason });

describe("regras do funil", () => {
  it("etapa aberta vai para qualquer outra aberta ou para perdido, nunca para ativo", () => {
    expect(nextStages("lead")).toEqual(["contato", "proposta", "perdido"]);
    expect(nextStages("proposta")).toEqual(["lead", "contato", "perdido"]);
    expect(canMove("contato", "ativo")).toBe(false);
    expect(canMove("contato", "contato")).toBe(false);
  });

  it("perdido reabre em etapa aberta; ativo não se move", () => {
    expect(nextStages("perdido")).toEqual(["lead", "contato", "proposta"]);
    expect(nextStages("ativo")).toEqual([]);
  });
});

describe("moveLeadSchema", () => {
  it("motivo vazio vira null; etapa desconhecida é recusada", () => {
    expect(moveLeadSchema.parse({ leadId: LEAD, from: "lead", to: "contato", reason: "  " }).reason).toBeNull();
    expect(moveLeadSchema.parse({ leadId: LEAD, from: "lead", to: "contato" }).reason).toBeNull();
    expect(moveLeadSchema.safeParse({ leadId: LEAD, from: "lead", to: "fechado" }).success).toBe(false);
  });
});

describe("MoveLead", () => {
  const deps = (current: Lead | null, moved: Lead | null = lead("contato")) => ({
    leads: { findById: vi.fn().mockResolvedValue(current) },
    pipeline: { move: vi.fn().mockResolvedValue(moved) },
  });

  it("move e registra de onde saiu; motivo só vai junto quando é perda", async () => {
    const { leads, pipeline } = deps(lead("lead"));
    const result = await new MoveLead(leads, pipeline).execute(writer, move("lead", "contato", "anotação solta"));
    expect(result.ok).toBe(true);
    expect(pipeline.move).toHaveBeenCalledWith("ana", LEAD, "lead", "contato", null);
  });

  it("perdido exige motivo com pelo menos 5 caracteres", async () => {
    const { leads, pipeline } = deps(lead("proposta"), lead("perdido"));
    const semMotivo = await new MoveLead(leads, pipeline).execute(writer, move("proposta", "perdido", "não"));
    expect(!semMotivo.ok && semMotivo.error.code).toBe("validation_failed");
    expect(pipeline.move).not.toHaveBeenCalled();

    expect((await new MoveLead(leads, pipeline).execute(writer, move("proposta", "perdido", "Fechou com o concorrente."))).ok).toBe(true);
    expect(pipeline.move).toHaveBeenCalledWith("ana", LEAD, "proposta", "perdido", "Fechou com o concorrente.");
  });

  it("não vai para ativo à mão, e lead ativo não se move", async () => {
    const paraAtivo = deps(lead("proposta"));
    const r1 = await new MoveLead(paraAtivo.leads, paraAtivo.pipeline).execute(writer, move("proposta", "ativo"));
    expect(!r1.ok && r1.error.code).toBe("invalid_stage_change");

    const deAtivo = deps(lead("ativo"));
    const r2 = await new MoveLead(deAtivo.leads, deAtivo.pipeline).execute(writer, move("ativo", "lead"));
    expect(!r2.ok && r2.error.code).toBe("invalid_stage_change");
    expect(deAtivo.pipeline.move).not.toHaveBeenCalled();
  });

  it("se outra pessoa moveu antes, dá conflito em vez de sobrescrever", async () => {
    const stale = deps(lead("proposta"));
    const r1 = await new MoveLead(stale.leads, stale.pipeline).execute(writer, move("lead", "contato"));
    expect(!r1.ok && r1.error.code).toBe("conflict");
    expect(stale.pipeline.move).not.toHaveBeenCalled();

    // Corrida entre a leitura e a gravação: o banco não acha mais o lead na etapa de origem.
    const race = deps(lead("lead"), null);
    const r2 = await new MoveLead(race.leads, race.pipeline).execute(writer, move("lead", "contato"));
    expect(!r2.ok && r2.error.code).toBe("conflict");
  });

  it("quem só lê não move; lead inexistente → não encontrado", async () => {
    const { leads, pipeline } = deps(lead("lead"));
    const forbidden = await new MoveLead(leads, pipeline).execute(reader, move("lead", "contato"));
    expect(!forbidden.ok && forbidden.error.code).toBe("forbidden");
    expect(leads.findById).not.toHaveBeenCalled();

    const none = deps(null);
    const missing = await new MoveLead(none.leads, none.pipeline).execute(writer, move("lead", "contato"));
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });
});

describe("GetLeadHistory", () => {
  it("traz o nome de quem moveu; conta excluída aparece como 'Conta removida'", async () => {
    const history = vi.fn().mockResolvedValue([
      { from: "contato", to: "perdido", changedBy: "ana", reason: "Sem interesse", changedAt: new Date() },
      { from: "lead", to: "contato", changedBy: null, reason: null, changedAt: new Date() },
    ]);
    const names = vi.fn().mockResolvedValue(new Map([["ana", "Ana Comercial"]]));
    const result = await new GetLeadHistory({ history }, names).execute(reader, LEAD);
    expect(names).toHaveBeenCalledWith(["ana"]);
    expect(result.ok && result.value.map((c) => c.changedByName)).toEqual(["Ana Comercial", "Conta removida"]);
  });

  it("quem não tem acesso ao CRM não vê o histórico", async () => {
    const history = vi.fn();
    expect((await new GetLeadHistory({ history }, vi.fn()).execute({ id: "x", canRead: false, canWrite: false }, LEAD)).ok).toBe(false);
    expect(history).not.toHaveBeenCalled();
  });
});
