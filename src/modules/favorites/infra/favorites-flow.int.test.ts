import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { InMemoryEventBus } from "@/shared/events";
import { ListMyFavorites } from "../features/fav-list/fav-list.use-case";
import { ToggleFavorite } from "../features/fav-toggle/fav-toggle.use-case";
import { eventDirectory, favoriteTargets, placeDirectory } from "./favorite-targets";
import { PostgresFavoriteRepository } from "./postgres-favorite-repository";

// Fluxo contra o banco, com os adaptadores reais (APIs públicas de places e events).
const db = sql();
const repo = new PostgresFavoriteRepository(db);
const bus = new InMemoryEventBus();
const added: unknown[] = [];
bus.subscribe("favorites.FavoriteAdded", (e) => void added.push(e.payload));
const toggle = new ToggleFavorite(repo, favoriteTargets, bus);
const list = new ListMyFavorites(repo, placeDirectory, eventDirectory);

const user = crypto.randomUUID();
const tag = crypto.randomUUID().slice(0, 8);
let placeId: string;
let futureEvent: string;
let pastEvent: string;

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${user}, ${`ff-${user}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  [{ id: placeId }] = await db<{ id: string }[]>`
    insert into places.places (source, source_id, name, category, location)
    values ('osm', ${`int/fav-${tag}`}, ${`Café Favorito ${tag}`}, 'cafes', extensions.st_makepoint(-48.8456, -26.3045)::extensions.geography)
    returning id`;
  const addEvent = async (title: string, startsInHours: number) => {
    const [{ id }] = await db<{ id: string }[]>`
      insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at)
      values (${user}, ${placeId}, ${title}, 'Evento do teste de favoritos.', 'shows',
              now() + make_interval(hours => ${startsInHours}), now() + make_interval(hours => ${startsInHours + 2}))
      returning id`;
    return id;
  };
  futureEvent = await addEvent(`Show futuro ${tag}`, 24);
  pastEvent = await addEvent(`Show passado ${tag}`, -48);
});

afterAll(async () => {
  await db`delete from auth.users where id = ${user}`; // apaga favoritos e eventos (cascade)
  await db`delete from places.places where id = ${placeId}`;
  await db.end();
});

describe("favoritos com places e events reais", () => {
  it("favorita lugar e eventos que existem; recusa id inexistente", async () => {
    for (const [entityType, entityId] of [
      ["place", placeId],
      ["event", pastEvent],
      ["event", futureEvent],
    ] as const) {
      expect((await toggle.execute(user, { entityType, entityId, favorite: true })).ok).toBe(true);
    }
    expect((await toggle.execute(user, { entityType: "place", entityId: crypto.randomUUID(), favorite: true })).ok).toBe(false);
    expect((await toggle.execute(user, { entityType: "event", entityId: placeId, favorite: true })).ok).toBe(false);
    expect(added).toHaveLength(3);
  });

  it("lista por tipo, com o evento passado marcado como encerrado e depois dos próximos", async () => {
    const mine = await list.execute(user);
    expect(mine.places).toEqual([expect.objectContaining({ id: placeId, name: `Café Favorito ${tag}`, categoryLabel: expect.any(String) })]);
    expect(mine.events.map((e) => [e.id, e.timing, e.placeName])).toEqual([
      [futureEvent, "upcoming", `Café Favorito ${tag}`],
      [pastEvent, "ended", `Café Favorito ${tag}`],
    ]);
  });

  it("remover tira da lista", async () => {
    await toggle.execute(user, { entityType: "event", entityId: pastEvent, favorite: false });
    expect((await list.execute(user)).events.map((e) => e.id)).toEqual([futureEvent]);
  });
});
