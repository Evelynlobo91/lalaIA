import { describe, expect, it, vi } from "vitest";
import { FindEventCandidates, MAX_EVENT_CANDIDATES, type EventCandidateRow } from "./event-candidates";

const from = new Date("2026-10-10T20:00:00Z");
const to = new Date("2026-10-10T23:00:00Z");
const row = (id: string, placeId: string): EventCandidateRow => ({
  id,
  title: `Evento ${id}`,
  category: "shows",
  placeId,
  startsAt: from,
  endsAt: to,
  priceCents: 2500,
  createdAt: new Date("2026-10-09T10:00:00Z"),
});

function setup(rows: EventCandidateRow[]) {
  const reader = { listOverlapping: vi.fn().mockResolvedValue(rows) };
  const places = { summaries: vi.fn().mockResolvedValue([{ id: "p1", name: "Teatro", neighborhood: "Centro" }]) };
  return { reader, places, useCase: new FindEventCandidates(reader, places) };
}

describe("FindEventCandidates", () => {
  it("devolve os eventos do período com o lugar e a data de publicação (lugares numa consulta só)", async () => {
    const { reader, places, useCase } = setup([row("a", "p1"), row("b", "p1"), row("c", "sumiu")]);
    const result = await useCase.execute({ from, to, limit: 20 });

    expect(reader.listOverlapping).toHaveBeenCalledWith(from, to, 20);
    expect(places.summaries).toHaveBeenCalledTimes(1);
    expect(places.summaries).toHaveBeenCalledWith(["p1", "sumiu"]);
    expect(result[0]).toMatchObject({ id: "a", placeName: "Teatro", neighborhood: "Centro", priceCents: 2500, publishedAt: new Date("2026-10-09T10:00:00Z") });
    expect(result[2]).toMatchObject({ id: "c", placeName: "Local a confirmar", neighborhood: null });
  });

  it("limita a quantidade e não consulta nada com período vazio", async () => {
    const { reader, useCase } = setup([]);
    await useCase.execute({ from, to, limit: 10_000 });
    expect(reader.listOverlapping).toHaveBeenCalledWith(from, to, MAX_EVENT_CANDIDATES);

    reader.listOverlapping.mockClear();
    expect(await useCase.execute({ from: to, to: from, limit: 10 })).toEqual([]);
    expect(reader.listOverlapping).not.toHaveBeenCalled();
  });
});
