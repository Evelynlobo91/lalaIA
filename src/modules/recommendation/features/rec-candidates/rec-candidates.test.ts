import { describe, expect, it, vi } from "vitest";
import type { CandidateSource } from "../../domain/candidate-source";
import { NOW, at, candidate, constraints } from "../../domain/test-fixtures";
import { recCandidatesSchema } from "./rec-candidates.schema";
import { FindCandidates } from "./rec-candidates.use-case";

vi.mock("@/modules/places", async () => {
  const { z } = await import("zod");
  const coord = (min: number, max: number) =>
    z.coerce
      .number()
      .transform((v) => Math.round(v * 10_000) / 10_000)
      .refine((v) => v >= min && v <= max, "Fora da área atendida (Joinville e arredores).");
  return { servicePointShape: { lat: coord(-26.9, -25.8), lon: coord(-49.6, -48.3) } };
});

const source = (name: string, items: ReturnType<typeof candidate>[]): CandidateSource => ({ name, find: vi.fn().mockResolvedValue(items) });

describe("FindCandidates", () => {
  it("junta as fontes, remove repetidos e aplica os filtros duros", async () => {
    const events = source("events", [
      candidate({ id: "cabe", priceCents: 2_000 }),
      candidate({ id: "caro", priceCents: 9_000 }),
      candidate({ id: "fechando", availability: { known: true, window: { start: at(-120), end: at(10) } } }),
    ]);
    const places = source("places", [candidate({ kind: "place", id: "sem-preco", priceCents: null }), candidate({ id: "cabe", priceCents: 2_000 })]);
    const log = { error: vi.fn() };

    const result = await new FindCandidates([events, places], log).execute(constraints({ budgetCents: 5_000 }));

    expect(result.map((c) => `${c.kind}:${c.id}`)).toEqual(["event:cabe", "place:sem-preco"]);
    expect(events.find).toHaveBeenCalledWith({ now: NOW, horizon: at(120), origin: null, radiusMeters: 10_000, categories: null });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("uma fonte que falha é logada (sem a localização) e as outras continuam", async () => {
    const broken: CandidateSource = { name: "missions", find: vi.fn().mockRejectedValue(new Error("banco fora")) };
    const log = { error: vi.fn() };
    const origin = { lat: -26.3, lon: -48.84 };

    const result = await new FindCandidates([broken, source("events", [candidate({ distanceMeters: 300 })])], log).execute(constraints({ origin }));

    expect(result).toHaveLength(1);
    expect(log.error).toHaveBeenCalledWith("fonte de candidatos falhou", { source: "missions", error: "Error: banco fora" });
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("-26.3");
  });
});

describe("recCandidatesSchema", () => {
  it("aplica padrões e converte reais/km", () => {
    expect(recCandidatesSchema.parse({})).toEqual({
      availableMinutes: 120,
      budgetCents: null,
      people: 1,
      maxDistanceMeters: 10_000,
      categories: null,
      avoidCategories: [],
      origin: null,
    });
    expect(recCandidatesSchema.parse({ tempo: "60", orcamento: "70", pessoas: "2", raio: "2", categoria: "shows,feiras,shows" })).toMatchObject({
      availableMinutes: 60,
      budgetCents: 7_000,
      people: 2,
      maxDistanceMeters: 2_000,
      categories: ["shows", "feiras"],
    });
  });

  it("arredonda a localização e recusa ponto fora da área, metade do par, categoria ou tempo inválidos", () => {
    expect(recCandidatesSchema.parse({ lat: "-26.304512", lon: "-48.845634" }).origin).toEqual({ lat: -26.3045, lon: -48.8456 });
    expect(recCandidatesSchema.safeParse({ lat: "-23.55", lon: "-46.63" }).success).toBe(false);
    expect(recCandidatesSchema.safeParse({ lat: "-26.3" }).success).toBe(false);
    expect(recCandidatesSchema.safeParse({ categoria: "nao-existe" }).success).toBe(false);
    expect(recCandidatesSchema.safeParse({ tempo: "5" }).success).toBe(false);
  });
});
