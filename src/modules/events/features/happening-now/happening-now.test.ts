import { describe, expect, it, vi } from "vitest";
import type { EventCard } from "../../domain/event-card";
import { happeningNowSchema } from "./happening-now.schema";
import { HappeningNow } from "./happening-now.use-case";

vi.mock("@/modules/places", async () => {
  const { z } = await import("zod");
  const coord = z.coerce.number().refine((v) => v > -27 && v < -25, "Fora da área atendida (Joinville e arredores).");
  return { servicePointShape: { lat: coord, lon: z.coerce.number() } };
});

const now = new Date("2026-10-10T20:00:00Z");
const min = (m: number) => new Date(now.getTime() + m * 60_000);
const event = (id: string, placeId: string, start: number, end: number): EventCard => ({
  id,
  title: `Evento ${id}`,
  category: "shows",
  placeId,
  startsAt: min(start),
  endsAt: min(end),
  priceCents: 0,
});

function setup(rows: EventCard[]) {
  const reader = { listUpcoming: vi.fn().mockResolvedValue(rows) };
  const places = {
    summaries: vi.fn().mockResolvedValue([
      { id: "perto", name: "Bar Perto", neighborhood: "Centro" },
      { id: "longe", name: "Teatro Longe", neighborhood: null },
    ]),
  };
  const distances = {
    distances: vi.fn().mockResolvedValue(
      new Map([
        ["perto", 300],
        ["longe", 4200],
      ]),
    ),
    format: (m: number) => `${m} m`,
  };
  return { reader, places, distances, useCase: new HappeningNow(reader, places, distances, () => now) };
}

describe("HappeningNow", () => {
  it("pede ao leitor quem se sobrepõe às próximas 3 h e separa 'agora' de 'em breve'", async () => {
    const { reader, useCase } = setup([event("a", "longe", -25, 60), event("b", "perto", 40, 120), event("c", "perto", -80, 30)]);
    const result = await useCase.execute({ origin: null });
    expect(reader.listUpcoming.mock.calls[0]![0].window).toEqual({ from: now, to: min(180) });

    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.now.map((e) => [e.id, e.timeLabel])).toEqual([
      ["a", "Começou há 25 min"],
      ["c", "Começou há 1 h 20 min"],
    ]);
    expect(result.value.soon.map((e) => [e.id, e.timeLabel])).toEqual([["b", "Começa em 40 min"]]);
    expect(result.value.now[0]).toMatchObject({ placeName: "Teatro Longe", happeningNow: true, distanceLabel: null });
    expect(result.value.nearMe).toBe(false);
  });

  it("sem localização não consulta distância", async () => {
    const { distances, useCase } = setup([event("a", "perto", -5, 60)]);
    await useCase.execute({ origin: null });
    expect(distances.distances).not.toHaveBeenCalled();
  });

  it("com localização mostra a distância e ordena pela mais perto (sem distância por último)", async () => {
    const { distances, useCase } = setup([event("a", "longe", -25, 60), event("c", "perto", -80, 30), event("d", "sumiu", -10, 30)]);
    const result = await useCase.execute({ origin: { lat: -26.3, lon: -48.84 } });
    expect(distances.distances).toHaveBeenCalledWith({ lat: -26.3, lon: -48.84 }, ["longe", "perto", "sumiu"]);
    if (!result.ok) throw new Error("esperava ok");
    expect(result.value.now.map((e) => [e.id, e.distanceLabel])).toEqual([
      ["c", "300 m"],
      ["a", "4200 m"],
      ["d", null],
    ]);
    expect(result.value.nearMe).toBe(true);
  });
});

describe("happeningNowSchema", () => {
  it("sem lat/lon → sem origem", () => {
    expect(happeningNowSchema.parse({})).toEqual({ origin: null });
  });

  it("com lat/lon válidos → origem", () => {
    expect(happeningNowSchema.parse({ lat: "-26.3", lon: "-48.84" })).toEqual({ origin: { lat: -26.3, lon: -48.84 } });
  });

  it("só um dos dois, ou fora da área → erro", () => {
    expect(happeningNowSchema.safeParse({ lat: "-26.3" }).success).toBe(false);
    expect(happeningNowSchema.safeParse({ lat: "10", lon: "-48.8" }).error?.issues[0]?.message).toMatch(/Fora da área/);
  });
});
