import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { explorerProfileOf } from "../index";

// Ponta a ponta pelas APIs públicas reais (missions, favorites, places, events), sem join entre schemas.
const db = sql();
const prefix = `explorador-${Date.now()}`;
const parceiro = crypto.randomUUID();
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();

async function place(n: number, category: string, neighborhood: string | null) {
  const [row] = await db<{ id: string }[]>`
    insert into places.places (source, source_id, name, category, neighborhood, location)
    values ('osm', ${`${prefix}/${n}`}, ${`Lugar ${prefix} ${n}`}, ${category}, ${neighborhood}, extensions.st_makepoint(-48.84, -26.3)::extensions.geography)
    returning id`;
  return row.id;
}

beforeAll(async () => {
  for (const id of [parceiro, ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`exp-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${parceiro}, 'partner')`;
  const cafe = await place(1, "cafes", "Centro");
  const parque = await place(2, "ar-livre", "Glória");
  const museu = await place(3, "cultura", "Centro");

  // Ana favorita o café e um show; conclui uma missão de uma etapa no parque.
  const [evento] = await db<{ id: string }[]>`
    insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at, price_cents, status)
    values (${parceiro}, ${museu}, ${`Show ${prefix}`}, 'Evento do teste do perfil de explorador.', 'shows', now() + interval '1 day', now() + interval '1 day 2 hours', 0, 'scheduled')
    returning id`;
  await db`insert into favorites.favorites (user_id, entity_type, entity_id) values (${ana}, 'place', ${cafe}), (${ana}, 'event', ${evento.id})`;
  const [mission] = await db<{ id: string }[]>`
    insert into missions.missions (owner_id, title, description, xp, starts_at, ends_at)
    values (${parceiro}, ${`Missão ${prefix}`}, 'Missão do teste do perfil de explorador.', 60, now() - interval '1 day', now() + interval '1 day')
    returning id`;
  const [step] = await db<{ id: string }[]>`insert into missions.mission_steps (mission_id, position, title, place_id) values (${mission.id}, 1, 'Caminhe no parque', ${parque}) returning id`;
  const [um] = await db<{ id: string }[]>`insert into missions.user_missions (user_id, mission_id) values (${ana}, ${mission.id}) returning id`;
  await db`insert into missions.step_completions (user_mission_id, step_id, user_id) values (${um.id}, ${step.id}, ${ana})`;
  await db`update missions.user_missions set status = 'completed', completed_at = now() where id = ${um.id}`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia})`;
  await db`delete from events.events where owner_id = ${parceiro}`;
  await db`delete from missions.missions where owner_id = ${parceiro}`;
  await db`delete from auth.users where id = ${parceiro}`;
  await db`delete from places.places where source_id like ${`${prefix}/%`}`;
  await db.end();
});

describe("perfil de explorador pelas APIs públicas", () => {
  it("conta lugares, eventos, missões, categorias e bairros da própria pessoa", async () => {
    const profile = await explorerProfileOf(ana);
    expect(profile).toMatchObject({ placesDiscovered: 2, placesVisited: 1, placesFavorited: 1, eventsFavorited: 1, missionsCompleted: 1, checkIns: 1 });
    expect(profile.categories.map((c) => c.id).sort()).toEqual(["ar-livre", "cafes", "shows"]);
    expect(profile.neighborhoods).toEqual(["Centro", "Glória"]);
  });

  it("outra pessoa não vê nada da Ana (RLS em missions e favorites)", async () => {
    expect(await explorerProfileOf(bia)).toMatchObject({ placesDiscovered: 0, eventsFavorited: 0, missionsCompleted: 0, checkIns: 0, categories: [], neighborhoods: [] });
  });
});
