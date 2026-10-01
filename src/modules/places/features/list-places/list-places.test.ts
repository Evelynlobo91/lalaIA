import { describe, expect, it, vi } from "vitest";
import type { PlaceCard } from "../../domain/place-card";
import { decodeCursor, encodeCursor, listPlacesSchema } from "./list-places.schema";
import { ListPlaces } from "./list-places.use-case";

const ID = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const card = (n: number, patch: Partial<PlaceCard> = {}): PlaceCard => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: `Lugar ${n}`,
  category: "bares",
  neighborhood: "Centro",
  openingHours: null,
  ...patch,
});

describe("cursor", () => {
  it("ida e volta", () => {
    const cursor = { name: "Açaí Visconde", id: ID };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each(["", "lixo", Buffer.from('{"name":"x","id":"não-é-uuid"}').toString("base64url"), Buffer.from("[1,2]").toString("base64url")])(
    "cursor adulterado %j é recusado",
    (value) => {
      expect(decodeCursor(value)).toBeNull();
    },
  );

  it("schema: padrão de 20 por página, máximo 50 e cursor inválido vira erro", () => {
    expect(listPlacesSchema.parse({})).toEqual({ cursor: null, limit: 20 });
    expect(listPlacesSchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(listPlacesSchema.safeParse({ cursor: "lixo" }).success).toBe(false);
  });
});

describe("ListPlaces", () => {
  // 2026-10-05 12:00 em Joinville (segunda).
  const noon = () => new Date("2026-10-05T15:00:00Z");

  it("pede um a mais para saber se há próxima página e devolve o cursor do último item", async () => {
    const reader = { listAfter: vi.fn().mockResolvedValue([card(1), card(2), card(3)]) };
    const res = await new ListPlaces(reader, noon).execute({ cursor: null, limit: 2 });

    expect(reader.listAfter).toHaveBeenCalledWith(null, 3);
    expect(res.ok && res.value.items.map((i) => i.name)).toEqual(["Lugar 1", "Lugar 2"]);
    expect(res.ok && decodeCursor(res.value.nextCursor!)).toEqual({ name: "Lugar 2", id: card(2).id });
  });

  it("última página: sem cursor", async () => {
    const res = await new ListPlaces({ listAfter: vi.fn().mockResolvedValue([card(1)]) }, noon).execute({ cursor: null, limit: 2 });
    expect(res.ok && res.value.nextCursor).toBeNull();
  });

  it("traduz a categoria e calcula 'aberto agora' (null quando o horário é desconhecido)", async () => {
    const reader = {
      listAfter: vi.fn().mockResolvedValue([
        card(1, { category: "restaurantes", openingHours: "Mo-Fr 11:00-14:00" }),
        card(2, { openingHours: "Mo-Fr 18:00-23:00" }),
        card(3, { openingHours: null }),
      ]),
    };
    const res = await new ListPlaces(reader, noon).execute({ cursor: null, limit: 10 });
    expect(res.ok && res.value.items.map((i) => [i.categoryLabel, i.openNow])).toEqual([
      ["Restaurantes", true],
      ["Bares", false],
      ["Bares", null],
    ]);
  });
});
