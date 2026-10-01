import { describe, expect, it, vi } from "vitest";
import type { EventCard } from "../../domain/event-card";
import { ListEvents, decodeEventCursor, encodeEventCursor, listEventsSchema, whenLabel } from "./list-events";

const now = new Date("2026-10-10T22:00:00Z"); // 19:00 em Joinville
const card = (n: number, startsAt: string, endsAt: string, patch: Partial<EventCard> = {}): EventCard => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title: `Evento ${n}`,
  category: "shows",
  placeId: "lugar-1",
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  priceCents: 0,
  ...patch,
});

describe("cursor de eventos", () => {
  it("ida e volta; adulterado é recusado", () => {
    const c = { startsAt: new Date("2026-10-10T23:00:00Z"), id: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f" };
    expect(decodeEventCursor(encodeEventCursor(c))).toEqual(c);
    expect(decodeEventCursor("lixo")).toBeNull();
    expect(listEventsSchema.safeParse({ cursor: "lixo" }).success).toBe(false);
  });
});

describe("whenLabel", () => {
  it("mesmo dia mostra só a hora final; outro dia mostra a data final", () => {
    expect(whenLabel(new Date("2026-10-10T23:00:00Z"), new Date("2026-10-11T02:30:00Z"))).toMatch(/20:00 – 23:30$/);
    expect(whenLabel(new Date("2026-10-10T23:00:00Z"), new Date("2026-10-12T02:00:00Z"))).toMatch(/– .*11 de out\.?.*23:00$/);
  });
});

describe("ListEvents", () => {
  const places = { summaries: vi.fn().mockResolvedValue([{ id: "lugar-1", name: "Teatro Juarez Machado", neighborhood: "Centro" }]) };

  it("consulta com 'agora' e um a mais; marca 'acontecendo' e monta o cursor", async () => {
    const reader = {
      listUpcoming: vi.fn().mockResolvedValue([
        card(1, "2026-10-10T21:00:00Z", "2026-10-11T00:00:00Z"), // começou, não terminou → acontecendo
        card(2, "2026-10-11T00:00:00Z", "2026-10-11T02:00:00Z", { priceCents: 3000 }),
        card(3, "2026-10-12T00:00:00Z", "2026-10-12T02:00:00Z"),
      ]),
    };
    const res = await new ListEvents(reader, places, () => now).execute({ cursor: null, limit: 2, quando: null, categoria: [] });

    expect(reader.listUpcoming).toHaveBeenCalledWith({ now, cursor: null, limit: 3 });
    expect(places.summaries).toHaveBeenCalledWith(["lugar-1", "lugar-1"]);
    expect(res.ok && res.value.items.map((i) => [i.title, i.happeningNow, i.placeName, i.priceLabel])).toEqual([
      ["Evento 1", true, "Teatro Juarez Machado", "Grátis"],
      ["Evento 2", false, "Teatro Juarez Machado", expect.stringMatching(/A partir de R\$\s?30,00/)],
    ]);
    expect(res.ok && decodeEventCursor(res.value.nextCursor!)?.id).toBe(card(2, "", "").id);
  });

  it("lugar sumido não quebra a lista", async () => {
    const reader = { listUpcoming: vi.fn().mockResolvedValue([card(1, "2026-10-11T00:00:00Z", "2026-10-11T02:00:00Z")]) };
    const res = await new ListEvents(reader, { summaries: vi.fn().mockResolvedValue([]) }, () => now).execute({ cursor: null, limit: 20, quando: null, categoria: [] });
    expect(res.ok && [res.value.items[0].placeName, res.value.nextCursor]).toEqual(["Local a confirmar", null]);
  });
});

describe("ListEvents com filtro de data", () => {
  it("repassa ao leitor o período do atalho (no calendário de Joinville)", async () => {
    const reader = { listUpcoming: vi.fn().mockResolvedValue([]) };
    await new ListEvents(reader, { summaries: vi.fn().mockResolvedValue([]) }, () => now).execute({ cursor: null, limit: 20, quando: { kind: "hoje" }, categoria: [] });
    expect(reader.listUpcoming).toHaveBeenCalledWith({
      now,
      cursor: null,
      limit: 21,
      window: { from: new Date("2026-10-10T03:00:00Z"), to: new Date("2026-10-11T03:00:00Z") },
    });
  });
});
