import { describe, expect, it, vi } from "vitest";
import { formatPlanPrice, type Plan, type PlanData } from "../../domain/plan";
import { GetPlan, ListPlans, PlanEntitlements, SavePlan, defaultPlanResolver, planSchema } from "./plans.use-cases";

const PLAN = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";
const data = (patch: Partial<PlanData> = {}): PlanData => ({ code: "pro", name: "Pro", description: "", priceCents: 14900, features: ["live", "destaque"], isDefault: false, active: true, ...patch });
const plan = (patch: Partial<Plan> = {}): Plan => ({ id: PLAN, ...data(), ...patch });
const writer = { id: "fin", canRead: true, canWrite: true };
const reader = { id: "leitor", canRead: true, canWrite: false };

const form = (patch: Record<string, unknown> = {}) => ({ code: " Pro ", name: " Pro ", description: "", price: "149,90", features: ["destaque", "live"], active: "on", ...patch });

describe("planSchema", () => {
  it("normaliza código e nome, converte reais em centavos e ordena os recursos pelo catálogo", () => {
    expect(planSchema.parse(form())).toEqual({
      planId: undefined,
      data: { code: "pro", name: "Pro", description: "", priceCents: 14990, features: ["live", "destaque"], isDefault: false, active: true },
    });
  });

  it("aceita preço vazio (gratuito), com ponto de milhar e sem centavos", () => {
    expect(planSchema.parse(form({ price: "" })).data.priceCents).toBe(0);
    expect(planSchema.parse(form({ price: "1.249,00" })).data.priceCents).toBe(124900);
    expect(planSchema.parse(form({ price: "99" })).data.priceCents).toBe(9900);
    expect(planSchema.parse(form({ price: "149.90" })).data.priceCents).toBe(14990);
    expect(planSchema.parse(form({ price: "1.249" })).data.priceCents).toBe(124900);
  });

  it("checkbox desmarcado vira false; sem recursos vira lista vazia", () => {
    const parsed = planSchema.parse({ code: "basico", name: "Básico", description: "", price: "0" });
    expect(parsed.data).toMatchObject({ features: [], isDefault: false, active: false });
    expect(planSchema.parse(form({ isDefault: "on" })).data.isDefault).toBe(true);
  });

  it("recusa código fora do formato, preço negativo ou que não é número e recurso fora do catálogo", () => {
    expect(planSchema.safeParse(form({ code: "Plano Pro!" })).success).toBe(false);
    expect(planSchema.safeParse(form({ price: "-1" })).success).toBe(false);
    expect(planSchema.safeParse(form({ price: "abc" })).success).toBe(false);
    expect(planSchema.safeParse(form({ features: ["voar"] })).success).toBe(false);
  });
});

describe("formatPlanPrice", () => {
  it("gratuito e valor mensal em reais", () => {
    expect(formatPlanPrice(0)).toBe("Gratuito");
    expect(formatPlanPrice(14900)).toMatch(/^R\$\s149,00\/mês$/);
  });
});

describe("SavePlan", () => {
  const repo = (patch: Record<string, unknown> = {}) => ({ create: vi.fn().mockResolvedValue(plan()), update: vi.fn().mockResolvedValue(plan()), findById: vi.fn().mockResolvedValue(plan()), ...patch });

  it("cria; código repetido dá conflito", async () => {
    const plans = repo();
    expect((await new SavePlan(plans).execute(writer, undefined, data())).ok).toBe(true);
    expect(plans.create).toHaveBeenCalledWith("fin", data());

    const taken = await new SavePlan(repo({ create: vi.fn().mockResolvedValue(null) })).execute(writer, undefined, data());
    expect(!taken.ok && taken.error.code).toBe("conflict");
  });

  it("edita; inexistente → não encontrado; código de outro plano → conflito", async () => {
    expect((await new SavePlan(repo()).execute(writer, PLAN, data({ name: "Pro Plus" }))).ok).toBe(true);
    const missing = await new SavePlan(repo({ findById: vi.fn().mockResolvedValue(null) })).execute(writer, PLAN, data());
    expect(!missing.ok && missing.error.code).toBe("not_found");
    const taken = await new SavePlan(repo({ update: vi.fn().mockResolvedValue("code_taken") })).execute(writer, PLAN, data());
    expect(!taken.ok && taken.error.code).toBe("conflict");
  });

  it("o plano padrão precisa estar ativo", async () => {
    const plans = repo();
    const result = await new SavePlan(plans).execute(writer, undefined, data({ isDefault: true, active: false }));
    expect(!result.ok && result.error.code).toBe("default_plan_inactive");
    expect(plans.create).not.toHaveBeenCalled();
  });

  it("não dá para tirar o padrão de um plano sem marcar outro: sempre existe um padrão", async () => {
    const plans = repo({ findById: vi.fn().mockResolvedValue(plan({ isDefault: true })) });
    const result = await new SavePlan(plans).execute(writer, PLAN, data({ isDefault: false }));
    expect(!result.ok && result.error.code).toBe("default_plan_required");
    expect(plans.update).not.toHaveBeenCalled();
  });

  it("quem só lê não grava", async () => {
    const plans = repo();
    const result = await new SavePlan(plans).execute(reader, undefined, data());
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(plans.create).not.toHaveBeenCalled();
  });
});

describe("ListPlans / GetPlan", () => {
  it("lista o padrão primeiro e depois por preço", async () => {
    const list = vi.fn().mockResolvedValue([plan({ id: "c", name: "Premium", priceCents: 29900 }), plan({ id: "b", name: "Pro" }), plan({ id: "a", name: "Básico", priceCents: 0, isDefault: true })]);
    const result = await new ListPlans({ list }).execute(reader);
    expect(result.ok && result.value.map((p) => p.name)).toEqual(["Básico", "Pro", "Premium"]);
  });

  it("quem não tem acesso à cobrança não lista nem abre plano", async () => {
    const outsider = { id: "x", canRead: false, canWrite: false };
    const plans = { list: vi.fn(), findById: vi.fn() };
    expect((await new ListPlans(plans).execute(outsider)).ok).toBe(false);
    expect((await new GetPlan(plans).execute(outsider, PLAN)).ok).toBe(false);
    expect(plans.list).not.toHaveBeenCalled();
  });
});

describe("PlanEntitlements", () => {
  it("responde pelos recursos do plano que vale para o parceiro", async () => {
    const entitlements = new PlanEntitlements(defaultPlanResolver({ defaultPlan: vi.fn().mockResolvedValue(plan({ features: ["live", "missoes"] })) }));
    expect(await entitlements.has("dono", "live")).toBe(true);
    expect(await entitlements.has("dono", "destaque")).toBe(false);
    expect(await entitlements.featuresOf("dono")).toEqual(["live", "missoes"]);
  });

  it("sem plano (configuração quebrada) não libera nada", async () => {
    const entitlements = new PlanEntitlements(async () => null);
    expect(await entitlements.has("dono", "live")).toBe(false);
    expect(await entitlements.featuresOf("dono")).toEqual([]);
  });
});
