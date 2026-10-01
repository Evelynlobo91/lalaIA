import { describe, expect, it, vi } from "vitest";
import type { EventPlaceNames, EventSummaryReader, EventSummaryRow } from "../../domain/event-card";
import { GetEventSummaries } from "./event-summaries";

const row = (id: string, placeId: string, patch: Partial<EventSummaryRow> = {}): EventSummaryRow => ({
  id,
  title: `Evento ${id}`,
  category: "shows",
  placeId,
  startsAt: new Date("2026-10-10T23:00:00Z"),
  endsAt: new Date("2026-10-11T02:30:00Z"),
  priceCents: 0,
  status: "scheduled",
  ...patch,
});

describe("GetEventSummaries", () => {
  it("busca em lote, sem repetir ids, e junta o nome do lugar numa consulta só", async () => {
    const reader: EventSummaryReader = { findByIds: vi.fn().mockResolvedValue([row("e1", "p1"), row("e2", "p1", { status: "cancelled" }), row("e3", "p9")]) };
    const places: EventPlaceNames = { summaries: vi.fn().mockResolvedValue([{ id: "p1", name: "Teatro Juarez Machado", neighborhood: "Centro" }]) };

    const result = await new GetEventSummaries(reader, places).execute(["e1", "e2", "e1", "e3"]);

    expect(reader.findByIds).toHaveBeenCalledWith(["e1", "e2", "e3"]);
    expect(places.summaries).toHaveBeenCalledTimes(1);
    expect(places.summaries).toHaveBeenCalledWith(["p1", "p9"]);
    expect(result[0]).toMatchObject({ id: "e1", categoryLabel: "Shows e música", placeName: "Teatro Juarez Machado", neighborhood: "Centro", whenLabel: expect.stringContaining("20:00") });
    expect(result[1].status).toBe("cancelled");
    expect(result[2]).toMatchObject({ placeName: "Local a confirmar", neighborhood: null });
  });

  it("lista vazia não consulta nada", async () => {
    const reader: EventSummaryReader = { findByIds: vi.fn() };
    const places: EventPlaceNames = { summaries: vi.fn() };
    expect(await new GetEventSummaries(reader, places).execute([])).toEqual([]);
    expect(reader.findByIds).not.toHaveBeenCalled();
  });
});
