import { describe, expect, it, vi } from "vitest";
import type { PlaceCard } from "../../domain/place-card";
import { decodeCursor, encodeCursor } from "../list-places/list-places.schema";
import { SearchPlaces } from "./search-places";

const card = (n: number, patch: Partial<PlaceCard> = {}): PlaceCard => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: `Lugar ${n}`,
  category: "bares",
  neighborhood: "Centro",
  openingHours: null,
  ...patch,
});
const now = () => new Date("2026-10-05T15:00:00Z"); // segunda, 12:00 em Joinville

describe("SearchPlaces", () => {
  it("repassa o texto (aparado), pede um a mais e devolve o cursor do último item", async () => {
    const reader = { search: vi.fn().mockResolvedValue([card(1), card(2), card(3)]) };
    const res = await new SearchPlaces(reader, now).execute({ text: "  açaí ", cursor: null, limit: 2 });

    expect(reader.search).toHaveBeenCalledWith({ text: "açaí" }, null, 3);
    expect(res.ok && res.value.items.map((i) => [i.name, i.categoryLabel])).toEqual([
      ["Lugar 1", "Bares"],
      ["Lugar 2", "Bares"],
    ]);
    expect(res.ok && decodeCursor(res.value.nextCursor!)).toEqual({ name: "Lugar 2", id: card(2).id });
  });

  it("continua do cursor recebido; texto vazio vira 'sem texto'", async () => {
    const reader = { search: vi.fn().mockResolvedValue([card(4)]) };
    const cursor = { name: "Lugar 3", id: card(3).id };
    const res = await new SearchPlaces(reader, now).execute({ text: "  ", cursor: encodeCursor(cursor), limit: 2 });

    expect(reader.search).toHaveBeenCalledWith({ text: null }, cursor, 3);
    expect(res.ok && res.value.nextCursor).toBeNull();
  });

  it("cursor adulterado → ValidationError, sem consultar o banco", async () => {
    const reader = { search: vi.fn() };
    const res = await new SearchPlaces(reader, now).execute({ text: "bar", cursor: "lixo", limit: 2 });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.code).toBe("validation_failed");
    expect(reader.search).not.toHaveBeenCalled();
  });
});
