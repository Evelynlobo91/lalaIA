import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresFavoriteRepository } from "./postgres-favorite-repository";

const db = sql();
const repo = new PostgresFavoriteRepository(db);
const alice = crypto.randomUUID();
const bob = crypto.randomUUID();
const place = { entityType: "place" as const, entityId: crypto.randomUUID() };
const event = { entityType: "event" as const, entityId: crypto.randomUUID() };

beforeAll(async () => {
  for (const id of [alice, bob]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`f-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
});

afterAll(async () => {
  // Apagar o usuário apaga os favoritos (on delete cascade).
  await db`delete from auth.users where id in (${alice}, ${bob})`;
  await db.end();
});

describe("PostgresFavoriteRepository (com RLS)", () => {
  it("favorita e é idempotente: a segunda vez não duplica", async () => {
    expect(await repo.add(alice, place)).toBe(true);
    expect(await repo.add(alice, place)).toBe(false);
    expect(await repo.has(alice, place)).toBe(true);
    const [{ count }] = await db<{ count: number }[]>`select count(*)::int as count from favorites.favorites where user_id = ${alice}`;
    expect(count).toBe(1);
  });

  it("lista os favoritos do usuário, do mais recente para o mais antigo", async () => {
    await repo.add(alice, event);
    const list = await repo.listByUser(alice);
    expect(list.map((f) => f.entityType)).toEqual(["event", "place"]);
    expect(list[0]).toMatchObject({ entityId: event.entityId, createdAt: expect.any(Date) });
  });

  it("outro usuário não lê nem apaga os favoritos alheios, mesmo indo direto no banco", async () => {
    expect(await repo.has(bob, place)).toBe(false);
    expect(await repo.listByUser(bob)).toEqual([]);
    const leak = await asUser(bob, (tx) => tx`select * from favorites.favorites where user_id = ${alice}`, db);
    expect(leak).toHaveLength(0);
    const deleted = await asUser(bob, (tx) => tx`delete from favorites.favorites where user_id = ${alice} returning entity_id`, db);
    expect(deleted).toHaveLength(0);
    expect(await repo.has(alice, place)).toBe(true);
  });

  it("ninguém cria favorito em nome de outra pessoa", async () => {
    await expect(
      asUser(bob, (tx) => tx`insert into favorites.favorites (user_id, entity_type, entity_id) values (${alice}, 'place', ${crypto.randomUUID()})`, db),
    ).rejects.toThrow(/row-level security/);
  });

  it("anônimo (anon) não tem acesso ao schema", async () => {
    await expect(
      db.begin(async (tx) => {
        await tx`set local role anon`;
        return tx`select * from favorites.favorites`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("o banco recusa tipo desconhecido", async () => {
    await expect(asUser(alice, (tx) => tx`insert into favorites.favorites (user_id, entity_type, entity_id) values (${alice}, 'mission', ${crypto.randomUUID()})`, db)).rejects.toThrow(
      /check/,
    );
  });

  it("desfavorita de forma idempotente", async () => {
    expect(await repo.remove(alice, place)).toBe(true);
    expect(await repo.remove(alice, place)).toBe(false);
    expect(await repo.has(alice, place)).toBe(false);
    expect((await repo.listByUser(alice)).map((f) => f.entityId)).toEqual([event.entityId]);
  });
});
