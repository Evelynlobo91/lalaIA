import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { internalRoles, roleCapabilities, type Capability } from "../domain/capabilities";
import { PostgresRoleRepository } from "./postgres-role-repository";

const db = sql();
const repo = new PostgresRoleRepository(db);
const ids = { admin: crypto.randomUUID(), commercial: crypto.randomUUID(), finance: crypto.randomUUID(), moderator: crypto.randomUUID(), partner: crypto.randomUUID(), nobody: crypto.randomUUID() };
const tag = `caps${Date.now()}`;
let partnerId: string;
let eventId: string;
let placeId: string;

const has = async (userId: string, capability: Capability) =>
  (await asUser(userId, (tx) => tx<{ ok: boolean }[]>`select authz.has_capability(${capability}) as ok`, db))[0].ok;

beforeAll(async () => {
  for (const [name, id] of Object.entries(ids)) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${name}@lalaia.test`}, ${db.json({ terms_version: "2026-09", display_name: `Pessoa ${tag} ${name}` })})`;
    if (name !== "nobody") await db`insert into identity.user_roles (user_id, role) values (${id}, ${name})`;
  }
  const [partner] = await db<{ id: string }[]>`
    insert into partners.partners (owner_id, kind, business_name, phone, description)
    values (${ids.partner}, 'estabelecimento', ${`Bar ${tag}`}, '47999990000', 'Bar de teste das capacidades por papel.') returning id`;
  partnerId = partner.id;
  const [place] = await db<{ id: string }[]>`
    insert into places.places (source, source_id, name, category, location)
    values ('osm', ${`teste/${tag}`}, ${`Lugar ${tag}`}, 'bares', extensions.st_makepoint(-48.8456, -26.3045)::extensions.geography) returning id`;
  placeId = place.id;
  const [event] = await db<{ id: string }[]>`
    insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at)
    values (${ids.partner}, ${placeId}, ${`Show ${tag}`}, 'Evento de teste das capacidades.', 'shows', now() + interval '1 day', now() + interval '1 day 2 hours') returning id`;
  eventId = event.id;
});

afterAll(async () => {
  await db`delete from places.places where id = ${placeId}`;
  await db`delete from auth.users where id in ${db(Object.values(ids))}`;
  await db.end();
});

describe("papéis internos por capacidade (#157)", () => {
  it("a tabela do banco é igual ao mapa do código", async () => {
    const rows = await db<{ role: string; capability: string }[]>`select role, capability from authz.role_capabilities`;
    const fromDb = Object.fromEntries(internalRoles.map((role) => [role, rows.filter((r) => r.role === role).map((r) => r.capability).sort()]));
    const fromCode = Object.fromEntries(internalRoles.map((role) => [role, [...roleCapabilities[role]].sort()]));
    expect(fromDb).toEqual(fromCode);
  });

  it("authz.has_capability responde pelo papel de quem está na sessão", async () => {
    expect(await has(ids.admin, "audit:read")).toBe(true);
    expect(await has(ids.moderator, "partners:review")).toBe(true);
    expect(await has(ids.moderator, "billing:read")).toBe(false);
    expect(await has(ids.commercial, "leads:write")).toBe(true);
    expect(await has(ids.commercial, "content:edit")).toBe(false);
    expect(await has(ids.finance, "billing:write")).toBe(true);
    expect(await has(ids.partner, "backoffice:access")).toBe(false);
    expect(await has(ids.nobody, "backoffice:access")).toBe(false);
  });

  it("moderação vê e revisa cadastros de parceiros; comercial e financeiro não enxergam", async () => {
    const seen = (userId: string) => asUser(userId, (tx) => tx`select id from partners.partners where id = ${partnerId}`, db);
    expect(await seen(ids.moderator)).toHaveLength(1);
    expect(await seen(ids.commercial)).toHaveLength(0);
    expect(await seen(ids.finance)).toHaveLength(0);

    const approve = (userId: string) => asUser(userId, (tx) => tx`update partners.partners set status = 'approved', reviewed_by = ${userId}, reviewed_at = now() where id = ${partnerId} returning id`, db);
    expect(await approve(ids.finance)).toHaveLength(0);
    expect(await approve(ids.moderator)).toHaveLength(1);
  });

  it("moderação edita evento e lugar de outra pessoa; comercial e financeiro não", async () => {
    const editEvent = (userId: string) => asUser(userId, (tx) => tx`update events.events set title = ${`Show ${tag} revisado`} where id = ${eventId} returning id`, db);
    const editPlace = (userId: string) => asUser(userId, (tx) => tx`update places.places set name = ${`Lugar ${tag} revisado`} where id = ${placeId} returning id`, db);
    expect(await editEvent(ids.commercial)).toHaveLength(0);
    expect(await editPlace(ids.finance)).toHaveLength(0);
    expect(await editEvent(ids.moderator)).toHaveLength(1);
    expect(await editPlace(ids.moderator)).toHaveLength(1);
  });

  it("usuários comuns não leem a tabela de capacidades", async () => {
    await expect(asUser(ids.nobody, (tx) => tx`select * from authz.role_capabilities`, db)).rejects.toThrow(/permission denied/);
  });

  it("o banco recusa papel desconhecido", async () => {
    await expect(db`insert into identity.user_roles (user_id, role) values (${ids.nobody}, 'superuser')`).rejects.toThrow(/check/);
  });

  it("repositório: concede e revoga papel do time, e conta inexistente não tem papéis", async () => {
    await repo.grant(ids.nobody, "finance", ids.admin);
    await repo.grant(ids.nobody, "finance", ids.admin); // idempotente
    expect(await repo.currentRoles(ids.nobody)).toEqual(["finance"]);
    await repo.revoke(ids.nobody, "finance");
    expect(await repo.currentRoles(ids.nobody)).toEqual([]);
    expect(await repo.currentRoles(crypto.randomUUID())).toBeNull();
  });

  it("busca de usuários por nome ou e-mail, com % tratado como texto", async () => {
    const byName = await repo.listRecent(50, `${tag} moderator`);
    expect(byName.map((u) => u.id)).toEqual([ids.moderator]);
    expect(byName[0].roles).toEqual(["moderator"]);
    expect((await repo.listRecent(50, `${tag}-finance@`)).map((u) => u.id)).toEqual([ids.finance]);
    expect(await repo.listRecent(50, `${tag}%moderator`)).toHaveLength(0);
  });
});
