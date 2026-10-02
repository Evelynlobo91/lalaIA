import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { subscriptions } from "../index";
import { PostgresAchievementRepository } from "./postgres-achievement-repository";
import { PostgresXpLedger } from "./postgres-xp-ledger";

const db = sql();
const repo = new PostgresAchievementRepository(db);
const ledger = new PostgresXpLedger(db);
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const prefix = `conquistas-${Date.now()}`;
const placeIds: string[] = [];

beforeAll(async () => {
  for (const id of [ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`ach-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  // 5 lugares de 3 categorias, favoritados pela Bia.
  for (const [i, category] of ["cafes", "cafes", "ar-livre", "cultura", "cultura"].entries()) {
    const [row] = await db<{ id: string }[]>`
      insert into places.places (source, source_id, name, category, neighborhood, location)
      values ('osm', ${`${prefix}/${i}`}, ${`Lugar ${prefix} ${i}`}, ${category}, 'Centro', extensions.st_makepoint(-48.84, -26.3)::extensions.geography)
      returning id`;
    placeIds.push(row.id);
    await db`insert into favorites.favorites (user_id, entity_type, entity_id) values (${bia}, 'place', ${row.id})`;
  }
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia})`;
  const [left] = await db`select count(*)::int as n from progression.achievements where user_id in (${ana}, ${bia})`;
  expect(left.n).toBe(0);
  await db`delete from places.places where source_id like ${`${prefix}/%`}`;
  await db.end();
});

describe("PostgresAchievementRepository (append-only, RLS)", () => {
  it("desbloqueia uma vez por pessoa e conquista", async () => {
    const id = await repo.unlock(ana, "primeira-missao");
    expect(id).toEqual(expect.any(String));
    expect(await repo.unlock(ana, "primeira-missao")).toBeNull();
    expect(await repo.listUnlocked(ana)).toEqual([{ achievementId: "primeira-missao", unlockId: id, unlockedAt: expect.any(Date) }]);
  });

  it("cada pessoa só lê as próprias; ninguém grava como usuário", async () => {
    expect(await repo.listUnlocked(bia)).toEqual([]);
    expect(await asUser(bia, (tx) => tx`select id from progression.achievements where user_id = ${ana}`, db)).toHaveLength(0);
    await expect(asUser(bia, (tx) => tx`insert into progression.achievements (user_id, achievement_id) values (${bia}, 'nivel-3')`, db)).rejects.toThrow(/permission denied/);
  });

  it("append-only também para o backend; id fora do formato é recusado", async () => {
    await expect(db`update progression.achievements set achievement_id = 'nivel-3' where user_id = ${ana}`).rejects.toThrow(/append-only/);
    await expect(db`delete from progression.achievements where user_id = ${ana}`).rejects.toThrow(/append-only/);
    await expect(repo.unlock(ana, "Com Espaço")).rejects.toThrow(/check/);
  });

  it("assinaturas: FavoriteAdded desbloqueia as conquistas atendidas e credita o bônus uma vez", async () => {
    const bus = domainEvents();
    subscriptions(bus);
    const added = { userId: bia, entityType: "place" as const, entityId: placeIds[4] };
    await bus.publish("favorites.FavoriteAdded", added);
    await bus.publish("favorites.FavoriteAdded", added);
    expect((await repo.listUnlocked(bia)).map((u) => u.achievementId).sort()).toEqual(["explorou-3-categorias", "favoritou-5-lugares"]);
    const history = await ledger.history(bia, 10);
    expect(history.map((t) => [t.reason, t.amount, t.description]).sort()).toEqual([
      ["achievement", 15, "Conquista · Colecionador de lugares"],
      ["achievement", 20, "Conquista · Curiosidade sem fim"],
    ]);
    expect(await ledger.balanceOf(bia)).toBe(35);
  });
});
