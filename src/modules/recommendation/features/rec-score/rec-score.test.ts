import { describe, expect, it, vi } from "vitest";
import { Ranker } from "../../domain/score";
import { DEFAULT_WEIGHTS } from "../../domain/score-weights";
import { defaultSignals } from "../../domain/signals";
import { ANONYMOUS_PROFILE, type TasteProfile } from "../../domain/taste-profile";
import { NOW, at, candidate, constraints } from "../../domain/test-fixtures";
import { TasteProfileFromModules } from "../../infra/taste-profile-from-modules";
import { recScoreSchema } from "./rec-score.schema";
import { RecommendNow } from "./rec-score.use-case";
import { RecommendationEngine } from "./recommendation-engine";
import { toRecommendationItem } from "./recommendation-item";

const profile: TasteProfile = { ...ANONYMOUS_PROFILE, categories: ["shows"], favoriteKeys: new Set(["place:p1"]) };

function engineWith(items: ReturnType<typeof candidate>[], live: ReadonlySet<string> | Error = new Set()) {
  const finder = { execute: vi.fn().mockResolvedValue(items) };
  const liveReader = { liveNow: vi.fn(() => (live instanceof Error ? Promise.reject(live) : Promise.resolve(live))) };
  const log = { warn: vi.fn() };
  return { finder, liveReader, log, engine: new RecommendationEngine(finder, liveReader, new Ranker(defaultSignals, DEFAULT_WEIGHTS), log) };
}

describe("RecommendationEngine", () => {
  it("ranqueia os candidatos viáveis, aplica a live e corta no limite", async () => {
    const { engine, finder } = engineWith([candidate({ id: "a", category: "bares" }), candidate({ id: "b", category: "bares" }), candidate({ id: "c", category: "shows" })], new Set(["event:b"]));
    const k = constraints();
    const ranked = await engine.recommend(k, profile, 2);
    expect(finder.execute).toHaveBeenCalledWith(k);
    // b (live) e c (preferência) empatam no score; o bar sem nada a mais fica de fora do top 2.
    expect(ranked.map((r) => r.candidate.id).sort()).toEqual(["b", "c"]);
    expect(ranked.find((r) => r.candidate.id === "b")!.reasons.map((r) => r.text)).toContain("Com live agora");
  });

  it("se o status das lives falhar, segue sem live (logado)", async () => {
    const { engine, log } = engineWith([candidate()], new Error("fora"));
    expect(await engine.recommend(constraints(), profile, 5)).toHaveLength(1);
    expect(log.warn).toHaveBeenCalled();
  });
});

describe("RecommendNow", () => {
  it("lê o perfil do usuário da sessão, monta as restrições a partir dele e devolve itens com motivos", async () => {
    const { engine } = engineWith([candidate({ id: "show", category: "shows" })]);
    const profiles = { profileOf: vi.fn().mockResolvedValue(profile) };
    const constraintsFor = vi.fn(() => constraints());

    const result = await new RecommendNow(profiles, engine).execute({ userId: "u1", constraintsFor, limit: 10 });

    expect(profiles.profileOf).toHaveBeenCalledWith("u1");
    expect(constraintsFor).toHaveBeenCalledWith(profile);
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.items[0]).toMatchObject({ key: "event:show", reasons: ["Porque você curte Shows e música", "Acontecendo agora"], timeLabel: "Começou há 30 min" });
  });
});

describe("toRecommendationItem", () => {
  const item = (c: ReturnType<typeof candidate>) => toRecommendationItem({ candidate: c, score: 1, reasons: [] }, NOW);

  it("evento: preço, distância e há quanto tempo começou", () => {
    expect(item(candidate({ priceCents: 2_500, distanceMeters: 1_234 }))).toMatchObject({
      priceLabel: expect.stringMatching(/^A partir de R\$\s25,00$/),
      distanceLabel: "1,2 km",
      timeLabel: "Começou há 30 min",
      startedAt: at(-30).toISOString(),
      live: false,
    });
    expect(item(candidate({ availability: { known: true, window: { start: at(40), end: at(90) } } }))).toMatchObject({ timeLabel: "Começa em 40 min", startedAt: null });
  });

  it("lugar sem preço e missão com XP", () => {
    expect(item(candidate({ kind: "place", priceCents: null, availability: { known: true, window: { start: NOW, end: at(60) } } }))).toMatchObject({ priceLabel: null, timeLabel: "Aberto agora", placeName: null });
    expect(item(candidate({ kind: "mission", category: null, priceCents: null, xp: 120 }))).toMatchObject({ priceLabel: "120 XP" });
  });
});

describe("TasteProfileFromModules", () => {
  it("visitante → perfil anônimo, sem consultar nada", async () => {
    const sources = { preferencesOf: vi.fn(), favoriteKeysOf: vi.fn() };
    expect(await new TasteProfileFromModules(sources, { warn: vi.fn() }).profileOf(null)).toBe(ANONYMOUS_PROFILE);
    expect(sources.preferencesOf).not.toHaveBeenCalled();
  });

  it("junta preferências e favoritos; favoritos fora do ar não derrubam", async () => {
    const preferences = { categories: ["shows"], budgetMax: 100, radiusKm: 5, groupSize: "casal" };
    const ok = new TasteProfileFromModules(
      { preferencesOf: vi.fn().mockResolvedValue(preferences), favoriteKeysOf: vi.fn().mockResolvedValue([{ entityType: "place", entityId: "p1" }]) },
      { warn: vi.fn() },
    );
    expect(await ok.profileOf("u1")).toEqual({ ...preferences, favoriteKeys: new Set(["place:p1"]) });

    const log = { warn: vi.fn() };
    const broken = new TasteProfileFromModules({ preferencesOf: vi.fn().mockResolvedValue(preferences), favoriteKeysOf: vi.fn().mockRejectedValue(new Error("x")) }, log);
    expect((await broken.profileOf("u1")).favoriteKeys.size).toBe(0);
    expect(log.warn).toHaveBeenCalled();
  });
});

describe("recScoreSchema", () => {
  it("limite padrão 20, máximo 50", () => {
    expect(recScoreSchema.parse({}).limit).toBe(20);
    expect(recScoreSchema.safeParse({ limite: "51" }).success).toBe(false);
    expect(recScoreSchema.parse({ limite: "5", tempo: "60" })).toMatchObject({ limit: 5, constraints: { availableMinutes: 60 } });
  });
});
