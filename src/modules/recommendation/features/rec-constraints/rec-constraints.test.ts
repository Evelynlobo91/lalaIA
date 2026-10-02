import { describe, expect, it, vi } from "vitest";
import { ANONYMOUS_PROFILE, type TasteProfile } from "../../domain/taste-profile";
import { NOW } from "../../domain/test-fixtures";
import { constraintParamsSchema, noConstraintParams, parseConstraintParams } from "./rec-constraints.schema";
import { RecommendWithConstraints, constraintsHref, resolveConstraints } from "./rec-constraints.use-case";

vi.mock("@/modules/places", async () => {
  const { z } = await import("zod");
  const coord = (min: number, max: number) =>
    z.coerce
      .number()
      .transform((v) => Math.round(v * 10_000) / 10_000)
      .refine((v) => v >= min && v <= max, "Fora da área atendida (Joinville e arredores).");
  return { servicePointShape: { lat: coord(-26.9, -25.8), lon: coord(-49.6, -48.3) } };
});

const profile: TasteProfile = { categories: ["shows", "bares"], budgetMax: 100, radiusKm: 5, groupSize: "casal", favoriteKeys: new Set() };

describe("constraintParamsSchema", () => {
  it("tudo opcional; 'sem' = sem limite; localização arredondada", () => {
    expect(constraintParamsSchema.parse({})).toEqual(noConstraintParams);
    expect(constraintParamsSchema.parse({ tempo: "120", orcamento: "70", pessoas: "2", tipo: "diferente", lat: "-26.304512", lon: "-48.845634" })).toEqual({
      tempo: 120,
      orcamento: 70,
      pessoas: 2,
      tipo: "diferente",
      origin: { lat: -26.3045, lon: -48.8456 },
    });
    expect(constraintParamsSchema.parse({ orcamento: "sem" }).orcamento).toBeNull();
  });

  it("recusa valores inválidos com mensagem em português", () => {
    expect(parseConstraintParams({ tempo: "0" }).invalid).toBe("Tempo inválido.");
    expect(parseConstraintParams({ orcamento: "-5" }).invalid).toBe("Orçamento inválido.");
    expect(parseConstraintParams({ tipo: "radical" }).invalid).toBe("Tipo de experiência inválido.");
    expect(parseConstraintParams({ lat: "-23.55", lon: "-46.63" }).invalid).toMatch(/Fora da área atendida/);
    // Inválido cai nos padrões do perfil.
    expect(parseConstraintParams({ tipo: "radical" }).params).toEqual(noConstraintParams);
  });
});

describe("resolveConstraints", () => {
  it("sem nada na URL, usa o perfil: orçamento, raio e 'com quem sai'", () => {
    const { state, constraints } = resolveConstraints(noConstraintParams, profile, NOW);
    expect(state).toEqual({ tempo: 120, orcamento: 100, pessoas: 2, tipo: "qualquer", origin: null });
    expect(constraints).toEqual({ now: NOW, availableMinutes: 120, budgetCents: 10_000, people: 2, origin: null, maxDistanceMeters: 5_000, categories: null, avoidCategories: [] });
  });

  it("'tenho 2 horas, R$70, estou no centro, quero algo diferente'", () => {
    const origin = { lat: -26.3045, lon: -48.8456 };
    const { constraints } = resolveConstraints({ tempo: 120, orcamento: 70, pessoas: undefined, tipo: "diferente", origin }, profile, NOW);
    expect(constraints).toMatchObject({ availableMinutes: 120, budgetCents: 7_000, origin, categories: null, avoidCategories: ["shows", "bares"] });
  });

  it("tipo de experiência vira categorias; 'sem limite' explícito vence o perfil; visitante = 1 pessoa", () => {
    const { constraints } = resolveConstraints({ ...noConstraintParams, tipo: "cultura", orcamento: null }, ANONYMOUS_PROFILE, NOW);
    expect(constraints).toMatchObject({ categories: ["cultura", "exposicoes", "teatro"], budgetCents: null, people: 1, maxDistanceMeters: 10_000 });
  });
});

describe("constraintsHref", () => {
  const state = { tempo: 120, orcamento: 100, pessoas: 2, tipo: "qualquer" as const, origin: { lat: -26.3045, lon: -48.8456 } };

  it("aplica a mudança e preserva o resto (inclusive a localização)", () => {
    expect(constraintsHref(state, { tipo: "diferente" })).toBe("/sugestoes?tempo=120&orcamento=100&pessoas=2&tipo=diferente&lat=-26.3045&lon=-48.8456");
    expect(constraintsHref(state, { orcamento: null, origin: null })).toBe("/sugestoes?tempo=120&orcamento=sem&pessoas=2&tipo=qualquer");
  });
});

describe("RecommendWithConstraints", () => {
  it("envia ao motor as restrições resolvidas com o perfil e devolve o estado efetivo", async () => {
    let received: unknown;
    const recommend = {
      execute: vi.fn(async (input: { constraintsFor: (p: TasteProfile) => unknown }) => {
        received = input.constraintsFor(profile);
        return { ok: true as const, value: { items: [], constraints: received as never, profile } };
      }),
    };
    const result = await new RecommendWithConstraints(recommend, () => NOW).execute({ userId: "u1", params: { ...noConstraintParams, tempo: 60 }, limit: 20 });

    expect(recommend.execute).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", limit: 20 }));
    expect(received).toMatchObject({ availableMinutes: 60, budgetCents: 10_000, people: 2 });
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.state).toEqual({ tempo: 60, orcamento: 100, pessoas: 2, tipo: "qualquer", origin: null });
  });
});
