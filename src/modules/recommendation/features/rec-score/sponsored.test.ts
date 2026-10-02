import { describe, expect, it, vi } from "vitest";
import { Ranker } from "../../domain/score";
import { DEFAULT_WEIGHTS } from "../../domain/score-weights";
import { SPONSORED_LABEL, SponsoredSignal, defaultSignals } from "../../domain/signals";
import { ANONYMOUS_PROFILE } from "../../domain/taste-profile";
import { NOW, candidate, constraints } from "../../domain/test-fixtures";
import { RecommendationEngine } from "./recommendation-engine";
import { toRecommendationItem } from "./recommendation-item";

const engineWith = (items: ReturnType<typeof candidate>[], sponsored: ReadonlySet<string> | Error) => {
  const log = { warn: vi.fn() };
  const reader = { sponsoredNow: vi.fn(() => (sponsored instanceof Error ? Promise.reject(sponsored) : Promise.resolve(sponsored))) };
  const engine = new RecommendationEngine({ execute: vi.fn().mockResolvedValue(items) }, { liveNow: async () => new Set<string>() }, new Ranker(defaultSignals, DEFAULT_WEIGHTS), log, reader);
  return { engine, log };
};

describe("destaque patrocinado na recomendação (#29)", () => {
  it("o sinal pontua só o que está em destaque, com o rótulo 'Patrocinado'", () => {
    const signal = new SponsoredSignal();
    const ctx = { constraints: constraints(), profile: ANONYMOUS_PROFILE, liveKeys: new Set<string>(), sponsoredKeys: new Set(["event:e1"]) };
    expect(signal.evaluate(candidate({ id: "e1" }), ctx)).toEqual({ strength: 1, reason: SPONSORED_LABEL });
    expect(signal.evaluate(candidate({ id: "e2" }), ctx)).toBeNull();
    expect(signal.evaluate(candidate({ kind: "place", id: "e1" }), ctx)).toBeNull();
    // Contexto sem os destaques (porta opcional): não pontua.
    expect(signal.evaluate(candidate({ id: "e1" }), { ...ctx, sponsoredKeys: undefined })).toBeNull();
  });

  it("entre dois itens iguais, o patrocinado vem primeiro, e o motivo fica separado dos outros", async () => {
    const { engine } = engineWith([candidate({ id: "a", title: "Bar A", category: "bares" }), candidate({ id: "b", title: "Bar B", category: "bares" })], new Set(["event:b"]));
    const ranked = await engine.recommend(constraints(), ANONYMOUS_PROFILE, 10);
    expect(ranked.map((r) => r.candidate.id)).toEqual(["b", "a"]);
    expect(ranked[0].reasons.find((r) => r.signal === "sponsored")).toMatchObject({ text: "Patrocinado", points: DEFAULT_WEIGHTS.sponsored });
    expect(ranked[1].reasons.some((r) => r.signal === "sponsored")).toBe(false);
  });

  it("o destaque ajuda, mas não passa por cima de tudo: preferência + live ainda vencem", async () => {
    const profile = { ...ANONYMOUS_PROFILE, categories: ["shows" as const] };
    const finder = { execute: vi.fn().mockResolvedValue([candidate({ id: "pago", category: "bares" }), candidate({ id: "organico", category: "shows" })]) };
    const engine = new RecommendationEngine(finder, { liveNow: async () => new Set(["event:organico"]) }, new Ranker(defaultSignals, DEFAULT_WEIGHTS), { warn: vi.fn() }, { sponsoredNow: async () => new Set(["event:pago"]) });
    expect((await engine.recommend(constraints(), profile, 10)).map((r) => r.candidate.id)).toEqual(["organico", "pago"]);
  });

  it("na tela: o item vem marcado como patrocinado e 'Patrocinado' não entra nos motivos", async () => {
    const { engine } = engineWith([candidate({ id: "b", category: "shows" })], new Set(["event:b"]));
    const [recommendation] = await engine.recommend(constraints(), { ...ANONYMOUS_PROFILE, categories: ["shows"] }, 1);
    const item = toRecommendationItem(recommendation, NOW);
    expect(item.sponsored).toBe(true);
    expect(item.reasons).not.toContain("Patrocinado");
    expect(item.reasons).toContain("Porque você curte Shows e música");

    const organic = toRecommendationItem((await engineWith([candidate({ id: "c" })], new Set()).engine.recommend(constraints(), ANONYMOUS_PROFILE, 1))[0], NOW);
    expect(organic.sponsored).toBe(false);
  });

  it("se a leitura dos destaques falhar, o motor segue sem o sinal e registra o problema", async () => {
    const { engine, log } = engineWith([candidate({ id: "a" })], new Error("partners fora do ar"));
    const ranked = await engine.recommend(constraints(), ANONYMOUS_PROFILE, 10);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].reasons.some((r) => r.signal === "sponsored")).toBe(false);
    expect(log.warn).toHaveBeenCalledWith("destaques patrocinados indisponíveis", expect.anything());
  });
});
