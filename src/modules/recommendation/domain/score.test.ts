import { describe, expect, it } from "vitest";
import type { ScoreContext, ScoreSignal } from "./score";
import { Ranker } from "./score";
import { DEFAULT_WEIGHTS, resolveWeights } from "./score-weights";
import { FavoriteSignal, HappeningNowSignal, LiveSignal, NOVELTY_DAYS, NoveltySignal, PreferenceSignal, ProximitySignal, defaultSignals } from "./signals";
import { ANONYMOUS_PROFILE } from "./taste-profile";
import { NOW, at, candidate, constraints } from "./test-fixtures";

const origin = { lat: -26.3, lon: -48.84 };
const ctx = (overrides: Partial<ScoreContext> = {}): ScoreContext => ({ constraints: constraints(), profile: ANONYMOUS_PROFILE, liveKeys: new Set(), ...overrides });
const window = (start: number, end: number) => ({ known: true as const, window: { start: at(start), end: at(end) } });

describe("PreferenceSignal", () => {
  const s = new PreferenceSignal();
  it("explica com a categoria preferida", () => {
    expect(s.evaluate(candidate({ category: "shows" }), ctx({ profile: { ...ANONYMOUS_PROFILE, categories: ["shows"] } }))).toEqual({ strength: 1, reason: "Porque você curte Shows e música" });
  });
  it("sem a categoria nas preferências (ou sem categoria) não pontua", () => {
    expect(s.evaluate(candidate({ category: "bares" }), ctx({ profile: { ...ANONYMOUS_PROFILE, categories: ["shows"] } }))).toBeNull();
    expect(s.evaluate(candidate({ kind: "mission", category: null }), ctx())).toBeNull();
  });
});

describe("HappeningNowSignal", () => {
  const s = new HappeningNowSignal();
  it("evento acontecendo agora vale mais que começando em breve", () => {
    expect(s.evaluate(candidate({ availability: window(-30, 60) }), ctx())).toEqual({ strength: 1, reason: "Acontecendo agora" });
    expect(s.evaluate(candidate({ availability: window(40, 100) }), ctx())).toEqual({ strength: 0.6, reason: "Começa em 40 min" });
  });
  it("evento além do tempo disponível não pontua; lugar aberto agora pontua pouco", () => {
    expect(s.evaluate(candidate({ availability: window(200, 300) }), ctx())).toBeNull();
    expect(s.evaluate(candidate({ kind: "place", availability: window(0, 120) }), ctx())).toEqual({ strength: 0.3, reason: "Aberto agora" });
    expect(s.evaluate(candidate({ kind: "place", availability: { known: false } }), ctx())).toBeNull();
  });
});

describe("LiveSignal (porta; o módulo Live ainda não existe)", () => {
  const s = new LiveSignal();
  it("pontua só quem tem live ativa", () => {
    expect(s.evaluate(candidate({ id: "e1" }), ctx({ liveKeys: new Set(["event:e1"]) }))).toEqual({ strength: 1, reason: "Com live agora" });
    expect(s.evaluate(candidate({ id: "e1" }), ctx({ liveKeys: new Set(["place:e1"]) }))).toBeNull();
  });
});

describe("NoveltySignal", () => {
  const s = new NoveltySignal();
  it("novidade decai com o tempo e some depois de 14 dias", () => {
    expect(s.evaluate(candidate({ newSince: NOW }), ctx())).toEqual({ strength: 1, reason: "Novidade na agenda" });
    expect(s.evaluate(candidate({ newSince: at(-60 * 24 * 7) }), ctx())?.strength).toBeCloseTo(0.5);
    expect(s.evaluate(candidate({ newSince: at(-60 * 24 * NOVELTY_DAYS) }), ctx())).toBeNull();
    expect(s.evaluate(candidate({ newSince: null }), ctx())).toBeNull();
  });
  it("o motivo depende do tipo", () => {
    expect(s.evaluate(candidate({ kind: "place", newSince: NOW }), ctx())?.reason).toBe("Novo no LalaIA");
    expect(s.evaluate(candidate({ kind: "mission", newSince: NOW }), ctx())?.reason).toBe("Missão nova");
  });
});

describe("FavoriteSignal", () => {
  it("pontua o que está nos favoritos", () => {
    const profile = { ...ANONYMOUS_PROFILE, favoriteKeys: new Set(["place:p1"]) };
    expect(new FavoriteSignal().evaluate(candidate({ kind: "place", id: "p1" }), ctx({ profile }))).toEqual({ strength: 1, reason: "Está nos seus favoritos" });
    expect(new FavoriteSignal().evaluate(candidate({ kind: "event", id: "p1" }), ctx({ profile }))).toBeNull();
  });
});

describe("ProximitySignal", () => {
  const s = new ProximitySignal();
  it("mais perto pesa mais; só com localização", () => {
    const k = constraints({ origin, maxDistanceMeters: 2_000 });
    expect(s.evaluate(candidate({ distanceMeters: 500 }), ctx({ constraints: k }))).toEqual({ strength: 0.75, reason: "A 500 m de você" });
    expect(s.evaluate(candidate({ distanceMeters: 2_000 }), ctx({ constraints: k }))).toBeNull();
    expect(s.evaluate(candidate({ distanceMeters: 500 }), ctx())).toBeNull();
  });
});

describe("resolveWeights", () => {
  it("sem configuração usa os padrões; JSON parcial sobrescreve só o que veio", () => {
    expect(resolveWeights(undefined)).toEqual({ weights: DEFAULT_WEIGHTS, problem: null });
    expect(resolveWeights('{"live":5,"novelty":0}').weights).toEqual({ ...DEFAULT_WEIGHTS, live: 5, novelty: 0 });
  });
  it("configuração inválida volta para os padrões e explica o problema", () => {
    for (const raw of ["nao-e-json", '{"live":-1}', '{"desconhecido":1}', '{"live":"alto"}']) {
      const { weights, problem } = resolveWeights(raw);
      expect(weights).toEqual(DEFAULT_WEIGHTS);
      expect(problem).toMatch(/RECOMMENDATION_WEIGHTS/);
    }
  });
});

describe("Ranker", () => {
  const profile = { ...ANONYMOUS_PROFILE, categories: ["shows" as const] };

  it("ordena pelo score ponderado, com motivos do que mais pesou para o que menos", () => {
    const items = [
      candidate({ id: "bar", category: "bares", availability: window(-30, 60) }),
      candidate({ id: "show", category: "shows", availability: window(-30, 60) }),
      candidate({ id: "show-depois", category: "shows", availability: window(40, 100) }),
    ];
    const ranked = new Ranker(defaultSignals, DEFAULT_WEIGHTS).rank(items, ctx({ profile }));
    expect(ranked.map((r) => r.candidate.id)).toEqual(["show", "show-depois", "bar"]);
    expect(ranked[0]).toMatchObject({ score: 5.5, reasons: [{ text: "Porque você curte Shows e música", points: 3 }, { text: "Acontecendo agora", points: 2.5 }] });
  });

  it("pesos configuráveis mudam a ordem sem mudar código", () => {
    const items = [candidate({ id: "novo", category: "bares", newSince: at(-60 * 24 * 7), availability: window(40, 100) }), candidate({ id: "agora", category: "bares", availability: window(-10, 60) })];
    const padrão = new Ranker(defaultSignals, DEFAULT_WEIGHTS).rank(items, ctx());
    const novidadePrimeiro = new Ranker(defaultSignals, { ...DEFAULT_WEIGHTS, novelty: 10 }).rank(items, ctx());
    expect(padrão.map((r) => r.candidate.id)).toEqual(["agora", "novo"]);
    expect(novidadePrimeiro.map((r) => r.candidate.id)).toEqual(["novo", "agora"]);
  });

  it("determinístico: empate desempata por distância, início, título e chave", () => {
    const zero: ScoreSignal[] = [];
    const items = [
      candidate({ id: "c", title: "B", distanceMeters: null }),
      candidate({ id: "b", title: "A", distanceMeters: 900 }),
      candidate({ id: "a", title: "A", distanceMeters: 300 }),
      candidate({ id: "d", title: "A", distanceMeters: null }),
    ];
    const once = new Ranker(zero, DEFAULT_WEIGHTS).rank(items, ctx()).map((r) => r.candidate.id);
    const again = new Ranker(zero, DEFAULT_WEIGHTS).rank([...items].reverse(), ctx()).map((r) => r.candidate.id);
    expect(once).toEqual(["a", "b", "d", "c"]);
    expect(again).toEqual(once);
  });

  it("peso zero tira o motivo da lista", () => {
    const [r] = new Ranker(defaultSignals, { ...DEFAULT_WEIGHTS, happeningNow: 0 }).rank([candidate({ availability: window(-10, 60) })], ctx());
    expect(r!.reasons).toEqual([]);
    expect(r!.score).toBe(0);
  });
});
