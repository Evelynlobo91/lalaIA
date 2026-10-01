import { describe, expect, it, vi } from "vitest";
import type { EventCard } from "../../domain/event-card";
import { decodeEventCursor, encodeEventCursor } from "../list-events/list-events";
import { SearchEvents } from "./search-events";

const now = new Date("2026-10-10T22:00:00Z"); // 19:00 em Joinville
const card = (n: number, startsAt: string, endsAt: string): EventCard => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title: `Evento ${n}`,
  category: "shows",
  placeId: "lugar-1",
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  priceCents: 0,
});
const places = { summaries: vi.fn().mockResolvedValue([{ id: "lugar-1", name: "Teatro Juarez Machado", neighborhood: "Centro" }]) };

describe("SearchEvents", () => {
  it("busca com 'agora' e o texto; marca 'acontecendo', traz o lugar e monta o cursor", async () => {
    const reader = {
      search: vi.fn().mockResolvedValue([
        card(1, "2026-10-10T21:00:00Z", "2026-10-11T00:00:00Z"),
        card(2, "2026-10-11T00:00:00Z", "2026-10-11T02:00:00Z"),
        card(3, "2026-10-12T00:00:00Z", "2026-10-12T02:00:00Z"),
      ]),
    };
    const res = await new SearchEvents(reader, places, () => now).execute({ text: " samba ", cursor: null, limit: 2 });

    expect(reader.search).toHaveBeenCalledWith({ now, text: "samba" }, null, 3);
    expect(res.ok && res.value.items.map((i) => [i.title, i.happeningNow, i.placeName, i.priceLabel])).toEqual([
      ["Evento 1", true, "Teatro Juarez Machado", "Grátis"],
      ["Evento 2", false, "Teatro Juarez Machado", "Grátis"],
    ]);
    expect(res.ok && decodeEventCursor(res.value.nextCursor!)?.id).toBe(card(2, "", "").id);
  });

  it("continua do cursor recebido", async () => {
    const reader = { search: vi.fn().mockResolvedValue([]) };
    const cursor = { startsAt: new Date("2026-10-11T00:00:00Z"), id: card(2, "", "").id };
    const res = await new SearchEvents(reader, places, () => now).execute({ text: null, cursor: encodeEventCursor(cursor), limit: 5 });
    expect(reader.search).toHaveBeenCalledWith({ now, text: null }, cursor, 6);
    expect(res.ok && res.value).toEqual({ items: [], nextCursor: null });
  });

  it("repassa os filtros (categoria, lugares, períodos, preço) ao banco", async () => {
    const reader = { search: vi.fn().mockResolvedValue([]) };
    const periods = [{ from: now, to: now }];
    await new SearchEvents(reader, places, () => now).execute({
      text: null,
      category: "shows",
      placeIds: ["l1"],
      periods,
      price: { minCents: 0, maxCents: 0 },
      cursor: null,
      limit: 5,
    });
    expect(reader.search).toHaveBeenCalledWith({ now, text: null, category: "shows", placeIds: ["l1"], periods, price: { minCents: 0, maxCents: 0 } }, null, 6);
  });

  it("cursor adulterado → ValidationError", async () => {
    const reader = { search: vi.fn() };
    const res = await new SearchEvents(reader, places, () => now).execute({ text: "x", cursor: "lixo", limit: 5 });
    expect(!res.ok && res.error.code).toBe("validation_failed");
    expect(reader.search).not.toHaveBeenCalled();
  });
});
