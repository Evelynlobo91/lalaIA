import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { ModuleLiveTargetDirectory } from "./live-target-directory";

// Contra o banco, com as APIs públicas reais de places e events.
const db = sql();
const directory = new ModuleLiveTargetDirectory();
const owner = crypto.randomUUID();
const tag = crypto.randomUUID().slice(0, 8);
let placeId: string;
let eventId: string;

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${owner}, ${`live-dir-${owner}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  [{ id: placeId }] = await db<{ id: string }[]>`
    insert into places.places (source, source_id, name, category, neighborhood, location)
    values ('osm', ${`int/live-dir-${tag}`}, ${`Bar Ao Vivo ${tag}`}, 'bares', 'Centro', extensions.st_makepoint(-48.8456, -26.3045)::extensions.geography)
    returning id`;
  [{ id: eventId }] = await db<{ id: string }[]>`
    insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at)
    values (${owner}, ${placeId}, ${`Show ao vivo ${tag}`}, 'Evento do teste da Live.', 'shows', now() - interval '1 hour', now() + interval '2 hours')
    returning id`;
});

afterAll(async () => {
  await db`delete from auth.users where id = ${owner}`; // apaga o evento (cascade)
  await db`delete from places.places where id = ${placeId}`;
  await db.end();
});

describe("ModuleLiveTargetDirectory (#52)", () => {
  it("descreve lugar e evento com nome, lugar, horário, link e coordenadas (o evento usa as do lugar)", async () => {
    const missing = crypto.randomUUID();
    const infos = await directory.describe([
      { entityType: "place", entityId: placeId },
      { entityType: "event", entityId: eventId },
      { entityType: "place", entityId: missing },
      { entityType: "event", entityId: missing },
    ]);
    expect(infos).toHaveLength(2);
    expect(infos[0]).toEqual({
      entityType: "place",
      entityId: placeId,
      title: `Bar Ao Vivo ${tag}`,
      subtitle: "Centro",
      whenLabel: null,
      href: `/lugares/${placeId}`,
      location: { lat: -26.3045, lon: -48.8456 },
    });
    expect(infos[1]).toMatchObject({
      entityType: "event",
      entityId: eventId,
      title: `Show ao vivo ${tag}`,
      subtitle: `Bar Ao Vivo ${tag} · Centro`,
      href: `/eventos/${eventId}`,
      location: { lat: -26.3045, lon: -48.8456 },
    });
    expect(infos[1]!.whenLabel).toMatch(/\d{2}:\d{2}/);
  });

  it("lista vazia não consulta nada", async () => {
    expect(await directory.describe([])).toEqual([]);
  });
});
