import { describe, expect, it, vi } from "vitest";
import type { SearchConstraints } from "../../domain/constraints";
import { Ranker } from "../../domain/score";
import { DEFAULT_WEIGHTS } from "../../domain/score-weights";
import { defaultSignals } from "../../domain/signals";
import type { TasteProfile } from "../../domain/taste-profile";
import { NOW, at, candidate } from "../../domain/test-fixtures";
import { RecommendNow } from "../rec-score/rec-score.use-case";
import { RecommendationEngine } from "../rec-score/recommendation-engine";
import { realtimeFeedSchema } from "./realtime-feed.schema";
import { FEED_LIMIT, FEED_WINDOW_MINUTES, RealtimeFeed } from "./realtime-feed.use-case";

vi.mock("@/modules/places", async () => {
  const actual = await vi.importActual<typeof import("@/modules/places")>("@/modules/places");
  const { z } = await import("zod");
  const coord = (min: number, max: number) =>
    z.coerce
      .number()
      .transform((v) => Math.round(v * 10_000) / 10_000)
      .refine((v) => v >= min && v <= max, "Fora da área atendida (Joinville e arredores).");
  return { ...actual, servicePointShape: { lat: coord(-26.9, -25.8), lon: coord(-49.6, -48.3) } };
});

const profile: TasteProfile = { categories: ["shows"], budgetMax: 50, radiusKm: 2, groupSize: "amigos", favoriteKeys: new Set() };
const origin = { lat: -26.3045, lon: -48.8456 };

function setup(items: ReturnType<typeof candidate>[], live = new Set<string>()) {
  const finder = { execute: vi.fn().mockResolvedValue(items) };
  const engine = new RecommendationEngine(finder, { liveNow: async () => live }, new Ranker(defaultSignals, DEFAULT_WEIGHTS), { warn: vi.fn() });
  const recommend = new RecommendNow({ profileOf: vi.fn().mockResolvedValue(profile) }, engine);
  return { finder, feed: new RealtimeFeed(recommend, () => NOW) };
}

describe("RealtimeFeed", () => {
  it("busca as próximas 3 h com os padrões do perfil e a localização, no máximo 6 itens", async () => {
    const { finder, feed } = setup([]);
    await feed.execute({ userId: "u1", origin });
    const constraints = finder.execute.mock.calls[0]![0] as SearchConstraints;
    expect(constraints).toMatchObject({ now: NOW, availableMinutes: FEED_WINDOW_MINUTES, budgetCents: 5_000, people: 4, origin, maxDistanceMeters: 2_000 });
    expect(FEED_LIMIT).toBe(6);
  });

  it("ordena pelo score e mostra distância, há quanto tempo começou e o selo Live", async () => {
    const { feed } = setup(
      [
        candidate({ id: "longe", category: "bares", distanceMeters: 1_900 }),
        candidate({ id: "show", category: "shows", distanceMeters: 300 }),
        candidate({ id: "live", category: "teatro", distanceMeters: 800, availability: { known: true, window: { start: at(-80), end: at(60) } } }),
      ],
      new Set(["event:live"]),
    );
    const result = await feed.execute({ userId: "u1", origin });
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.nearMe).toBe(true);
    expect(result.value.items.map((i) => i.id)).toEqual(["show", "live", "longe"]);
    expect(result.value.items[0]).toMatchObject({ distanceLabel: "300 m", timeLabel: "Começou há 30 min", live: false });
    expect(result.value.items[1]).toMatchObject({ timeLabel: "Começou há 1 h 20 min", live: true });
  });

  it("sem localização: Joinville toda, sem distância", async () => {
    const { finder, feed } = setup([candidate()]);
    const result = await feed.execute({ userId: null, origin: null });
    expect((finder.execute.mock.calls[0]![0] as SearchConstraints).origin).toBeNull();
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.nearMe).toBe(false);
  });
});

describe("realtimeFeedSchema", () => {
  it("localização opcional, arredondada e só na área atendida", () => {
    expect(realtimeFeedSchema.parse({})).toEqual({ origin: null });
    expect(realtimeFeedSchema.parse({ lat: "-26.304512", lon: "-48.845634" })).toEqual({ origin });
    expect(realtimeFeedSchema.safeParse({ lat: "-23.55", lon: "-46.63" }).success).toBe(false);
  });
});
