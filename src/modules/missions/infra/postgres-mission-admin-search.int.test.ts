import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresMissionRepository } from "./postgres-mission-repository";

const db = sql();
const repo = new PostgresMissionRepository(db);
const owner = crypto.randomUUID();
const tag = `adm${Date.now()}`;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000);

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${owner}, ${`ma-${owner}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  const add = (title: string, status = "active", surprise = false) =>
    db`insert into missions.missions (owner_id, title, description, xp, starts_at, ends_at, status, archived_at, surprise)
       values (${owner}, ${title}, 'Missão de teste do backoffice.', 50, ${hours(-1)}, ${hours(24)}, ${status}, ${status === "archived" ? new Date() : null}, ${surprise})`;
  await add(`${tag} Rota do Chope`);
  await add(`${tag} Rota Encerrada`, "archived");
  await add(`${tag} Surpresa`, "active", true);
});

afterAll(async () => {
  await db`delete from platform.suspended_owners where owner_id = ${owner}`;
  await db`delete from auth.users where id = ${owner}`;
  await db.end();
});

describe("PostgresMissionRepository.searchAll (backoffice, #142)", () => {
  it("traz ativas, encerradas e surpresas", async () => {
    const found = await repo.searchAll(tag, 50);
    expect(found.map((m) => m.title).sort()).toEqual([`${tag} Rota Encerrada`, `${tag} Rota do Chope`, `${tag} Surpresa`]);
    expect(found.find((m) => m.title.endsWith("Encerrada"))?.status).toBe("archived");
    expect(found.find((m) => m.title.endsWith("Surpresa"))?.surprise).toBe(true);
  });

  it("busca por parte do título, sem diferenciar maiúsculas", async () => {
    expect(await repo.searchAll(`${tag} rota`, 50)).toHaveLength(2);
  });

  it("inclui missões de parceiro suspenso, que somem só do catálogo público", async () => {
    await db`insert into platform.suspended_owners (owner_id) values (${owner})`;
    expect(await repo.searchAll(tag, 50)).toHaveLength(3);
    const publicTitles = (await repo.listAvailable(new Date(), 500)).map((m) => m.title);
    expect(publicTitles).not.toContain(`${tag} Rota do Chope`);
    expect(await repo.findVisibleById((await repo.searchAll(`${tag} Rota do Chope`, 1))[0].id)).toBeNull();
  });
});
