import { describe, expect, it, vi } from "vitest";
import type { PlaceCard } from "../../domain/place-card";
import { decodeCursor, encodeCursor } from "../list-places/list-places.schema";
import { OPEN_SCAN_BATCH, SearchPlaces } from "./search-places";

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

  it("repassa categoria e bairro ao banco", async () => {
    const reader = { search: vi.fn().mockResolvedValue([]) };
    await new SearchPlaces(reader, now).execute({ text: null, category: "bares", neighborhood: "Glória", cursor: null, limit: 5 });
    expect(reader.search).toHaveBeenCalledWith({ text: null, category: "bares", neighborhood: "Glória" }, null, 6);
  });

  describe("aberto no período (horário conferido em memória)", () => {
    // Quarta, 07/10/2026, das 20:00 às 22:00 em Joinville.
    const noite = [{ from: new Date("2026-10-07T23:00:00Z"), to: new Date("2026-10-08T01:00:00Z") }];
    const bar = (n: number) => card(n, { openingHours: "Mo-Su 18:00-02:00" });
    const almoco = (n: number) => card(n, { openingHours: "Mo-Fr 11:00-14:00" });

    it("lê em lotes só lugares com horário e fica com os que abrem; o cursor é o último devolvido", async () => {
      const firstBatch = Array.from({ length: OPEN_SCAN_BATCH }, (_, i) => (i % 10 === 0 ? bar(i) : almoco(i)));
      const reader = { search: vi.fn().mockResolvedValueOnce(firstBatch).mockResolvedValueOnce([almoco(500), bar(501), bar(502)]) };
      const res = await new SearchPlaces(reader, now).execute({ text: null, openDuring: noite, cursor: null, limit: 10 });

      expect(reader.search).toHaveBeenNthCalledWith(1, { text: null, withOpeningHours: true }, null, OPEN_SCAN_BATCH);
      const lastOfFirstBatch = firstBatch.at(-1)!;
      expect(reader.search).toHaveBeenNthCalledWith(2, { text: null, withOpeningHours: true }, { name: lastOfFirstBatch.name, id: lastOfFirstBatch.id }, OPEN_SCAN_BATCH);
      expect(res.ok && res.value.items.map((i) => i.name)).toEqual([...Array.from({ length: 10 }, (_, i) => `Lugar ${i * 10}`)]);
      expect(res.ok && decodeCursor(res.value.nextCursor!)?.name).toBe("Lugar 90");
    });

    it("para no fim dos dados; período vazio não consulta nada", async () => {
      const reader = { search: vi.fn().mockResolvedValue([almoco(1), bar(2)]) };
      const res = await new SearchPlaces(reader, now).execute({ text: "x", openDuring: noite, cursor: null, limit: 10 });
      expect(reader.search).toHaveBeenCalledTimes(1);
      expect(res.ok && [res.value.items.map((i) => i.name), res.value.nextCursor]).toEqual([["Lugar 2"], null]);

      const empty = { search: vi.fn() };
      const none = await new SearchPlaces(empty, now).execute({ text: "x", openDuring: [], cursor: null, limit: 10 });
      expect(none.ok && none.value.items).toEqual([]);
      expect(empty.search).not.toHaveBeenCalled();
    });
  });

  it("cursor adulterado → ValidationError, sem consultar o banco", async () => {
    const reader = { search: vi.fn() };
    const res = await new SearchPlaces(reader, now).execute({ text: "bar", cursor: "lixo", limit: 2 });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.code).toBe("validation_failed");
    expect(reader.search).not.toHaveBeenCalled();
  });
});
