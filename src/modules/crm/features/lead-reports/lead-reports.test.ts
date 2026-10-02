import { describe, expect, it, vi } from "vitest";
import { GetConversionBySource, conversionPeriodSchema, leadFilterQuery, leadFilterSchema } from "./lead-reports";

const OWNER = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const now = new Date("2026-10-02T12:00:00Z");
const reader = { id: "bia", canRead: true, canWrite: false };

describe("leadFilterSchema", () => {
  it("lê etapa, origem e responsável da URL", () => {
    expect(leadFilterSchema.parse({ etapa: "proposta", origem: "instagram", responsavel: OWNER })).toEqual({ stage: "proposta", source: "instagram", ownerId: OWNER });
  });

  it("valor inválido ou vazio vira 'sem filtro'; parâmetro repetido usa o primeiro", () => {
    expect(leadFilterSchema.parse({ etapa: "fechado", origem: "", responsavel: "ana" })).toEqual({ stage: undefined, source: undefined, ownerId: undefined });
    expect(leadFilterSchema.parse({})).toEqual({ stage: undefined, source: undefined, ownerId: undefined });
    expect(leadFilterSchema.parse({ etapa: ["lead", "ativo"] }).stage).toBe("lead");
  });

  it("volta para a URL só com o que está preenchido", () => {
    expect(leadFilterQuery({})).toBe("");
    expect(leadFilterQuery({ stage: "contato", ownerId: OWNER })).toBe(`?etapa=contato&responsavel=${OWNER}`);
  });
});

describe("GetConversionBySource", () => {
  const counts = [
    { source: "instagram" as const, total: 8, active: 2, lost: 3 },
    { source: "visita" as const, total: 3, active: 1, lost: 0 },
  ];

  it("taxa = parceiros ativos ÷ leads da origem; todas as origens aparecem e há o total", async () => {
    const countsBySource = vi.fn().mockResolvedValue(counts);
    const result = await new GetConversionBySource({ countsBySource }, () => now).execute(reader, {});

    expect(countsBySource).toHaveBeenCalledWith("bia", null);
    expect(result.ok && result.value.period).toBe("todos");
    expect(result.ok && result.value.rows).toEqual([
      { source: "instagram", label: "Instagram", total: 8, active: 2, lost: 3, open: 3, rate: 25 },
      { source: "indicacao", label: "Indicação", total: 0, active: 0, lost: 0, open: 0, rate: null },
      { source: "visita", label: "Visita", total: 3, active: 1, lost: 0, open: 2, rate: 33.3 },
      { source: "outro", label: "Outro", total: 0, active: 0, lost: 0, open: 0, rate: null },
      { source: "total", label: "Todas as origens", total: 11, active: 3, lost: 3, open: 5, rate: 27.3 },
    ]);
  });

  it("período em dias vira a data de corte; valor inválido cai em 'todos'", async () => {
    const countsBySource = vi.fn().mockResolvedValue([]);
    const useCase = new GetConversionBySource({ countsBySource }, () => now);
    const result = await useCase.execute(reader, { periodo: "30" });
    expect(countsBySource).toHaveBeenCalledWith("bia", new Date("2026-09-02T12:00:00Z"));
    expect(result.ok && result.value.period).toBe(30);

    expect(conversionPeriodSchema.parse({ periodo: "45" }).periodo).toBe(0);
    await useCase.execute(reader, { periodo: "45" });
    expect(countsBySource).toHaveBeenLastCalledWith("bia", null);
  });

  it("quem não tem acesso ao CRM não vê o relatório", async () => {
    const countsBySource = vi.fn();
    const result = await new GetConversionBySource({ countsBySource }, () => now).execute({ id: "x", canRead: false, canWrite: false }, {});
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(countsBySource).not.toHaveBeenCalled();
  });
});
