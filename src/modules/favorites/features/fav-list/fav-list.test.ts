import { describe, expect, it, vi } from "vitest";
import type { Favorite, FavoriteRepository } from "../../domain/favorite";
import type { FavoriteEventDirectory, FavoriteEventSummary, FavoritePlaceDirectory } from "../../domain/favorite-list";
import { favListSchema, removeFavoriteSchema } from "./fav-list.schema";
import { ListMyFavorites, eventTiming } from "./fav-list.use-case";

const now = new Date("2026-10-10T12:00:00Z");
const h = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
const fav = (entityType: "place" | "event", entityId: string, minutesAgo: number): Favorite => ({ entityType, entityId, createdAt: new Date(now.getTime() - minutesAgo * 60_000) });
const event = (id: string, start: number, end: number, cancelled = false): FavoriteEventSummary => ({
  id,
  title: `Evento ${id}`,
  categoryLabel: "Shows e música",
  placeName: "Teatro",
  neighborhood: "Centro",
  startsAt: h(start),
  endsAt: h(end),
  cancelled,
  whenLabel: "sáb., 10 de out., 20:00 – 23:30",
});

function setup(favorites: Favorite[], events: FavoriteEventSummary[] = []) {
  const repo: FavoriteRepository = { add: vi.fn(), remove: vi.fn(), has: vi.fn(), listByUser: vi.fn().mockResolvedValue(favorites) };
  const places: FavoritePlaceDirectory = {
    summaries: vi.fn(async (ids: string[]) => ids.filter((id) => id !== "sumiu").map((id) => ({ id, name: `Lugar ${id}`, categoryLabel: "Cafés", neighborhood: null }))),
  };
  const eventDir: FavoriteEventDirectory = { summaries: vi.fn().mockResolvedValue(events) };
  return { repo, places, eventDir, useCase: new ListMyFavorites(repo, places, eventDir, () => now) };
}

describe("eventTiming", () => {
  it.each([
    ["upcoming", event("a", 1, 2)],
    ["happening", event("a", -1, 2)],
    ["ended", event("a", -3, -1)],
    ["ended", event("a", -3, 0)],
    ["cancelled", event("a", 1, 2, true)],
  ])("%s", (expected, e) => {
    expect(eventTiming(e, now)).toBe(expected);
  });
});

describe("ListMyFavorites", () => {
  it("separa por tipo, uma consulta em lote por tipo, e mantém os lugares do mais recente ao mais antigo", async () => {
    const { places, eventDir, useCase } = setup([fav("place", "p2", 1), fav("event", "e1", 2), fav("place", "p1", 3)], [event("e1", 1, 2)]);
    const result = await useCase.execute("u1");

    expect(places.summaries).toHaveBeenCalledWith(["p2", "p1"]);
    expect(eventDir.summaries).toHaveBeenCalledWith(["e1"]);
    expect(result.places.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(result.places[0].favoritedAt).toEqual(new Date(now.getTime() - 60_000));
    expect(result.events).toEqual([expect.objectContaining({ id: "e1", timing: "upcoming", placeName: "Teatro" })]);
  });

  it("eventos: primeiro os que ainda vão acontecer (por início), depois terminados e cancelados (mais recentes primeiro)", async () => {
    const events = [event("velho", -48, -46), event("depois", 5, 6), event("cancelado", -10, -9, true), event("agora", -1, 1), event("logo", 2, 3)];
    const { useCase } = setup(
      events.map((e, i) => fav("event", e.id, i)),
      events,
    );
    const result = await useCase.execute("u1");
    expect(result.events.map((e) => [e.id, e.timing])).toEqual([
      ["agora", "happening"],
      ["logo", "upcoming"],
      ["depois", "upcoming"],
      ["cancelado", "cancelled"],
      ["velho", "ended"],
    ]);
  });

  it("item que não existe mais some da lista", async () => {
    const { useCase } = setup([fav("place", "sumiu", 1), fav("place", "p1", 2), fav("event", "e-removido", 3)], []);
    const result = await useCase.execute("u1");
    expect(result.places.map((p) => p.id)).toEqual(["p1"]);
    expect(result.events).toEqual([]);
  });

  it("sem favoritos não consulta os outros módulos", async () => {
    const { places, eventDir, useCase } = setup([]);
    expect(await useCase.execute("u1")).toEqual({ places: [], events: [] });
    expect(places.summaries).not.toHaveBeenCalled();
    expect(eventDir.summaries).not.toHaveBeenCalled();
  });
});

describe("schemas da lista", () => {
  it("aba desconhecida ou ausente volta para lugares", () => {
    expect(favListSchema.parse({ aba: "eventos" }).aba).toBe("eventos");
    expect(favListSchema.parse({ aba: "<script>" }).aba).toBe("lugares");
    expect(favListSchema.parse({}).aba).toBe("lugares");
  });

  it("remover exige tipo e id válidos", () => {
    expect(removeFavoriteSchema.safeParse({ entityType: "event", entityId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f" }).success).toBe(true);
    expect(removeFavoriteSchema.safeParse({ entityType: "user", entityId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f" }).success).toBe(false);
    expect(removeFavoriteSchema.safeParse({ entityType: "place", entityId: "x" }).success).toBe(false);
  });
});
