import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresEventRepository } from "./postgres-event-repository";

const db = sql();
const repo = new PostgresEventRepository(db);
const owner = crypto.randomUUID();
const tag = `adm${Date.now()}`;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000);

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${owner}, ${`ea-${owner}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  const add = (title: string, start: number, status = "scheduled") =>
    db`insert into events.events (owner_id, place_id, title, description, category, starts_at, ends_at, status, cancelled_at)
       values (${owner}, ${crypto.randomUUID()}, ${title}, 'Evento de teste do backoffice.', 'shows', ${hours(start)}, ${hours(start + 1)}, ${status}, ${status === "cancelled" ? new Date() : null})`;
  await add(`${tag} Show Futuro`, 5);
  await add(`${tag} Show Passado`, -48);
  await add(`${tag} Feira Cancelada`, 3, "cancelled");
  await add(`${tag} 100% Grátis`, 8);
});

afterAll(async () => {
  await db`delete from platform.suspended_owners where owner_id = ${owner}`;
  await db`delete from auth.users where id = ${owner}`;
  await db.end();
});

describe("PostgresEventRepository.searchAll (backoffice, #142)", () => {
  it("traz também passados e cancelados, do mais recente para o mais antigo", async () => {
    const found = await repo.searchAll(tag, 50);
    expect(found.map((e) => e.title)).toEqual([`${tag} 100% Grátis`, `${tag} Show Futuro`, `${tag} Feira Cancelada`, `${tag} Show Passado`]);
    expect(found.find((e) => e.title.endsWith("Cancelada"))?.status).toBe("cancelled");
  });

  it("busca por parte do título, sem diferenciar maiúsculas", async () => {
    expect((await repo.searchAll(`${tag} show`, 50)).map((e) => e.title)).toEqual([`${tag} Show Futuro`, `${tag} Show Passado`]);
  });

  it("trata % e _ como texto, não como curinga", async () => {
    expect((await repo.searchAll(`${tag} 100%`, 50)).map((e) => e.title)).toEqual([`${tag} 100% Grátis`]);
    expect(await repo.searchAll(`${tag} ____ Futuro`, 50)).toHaveLength(0);
  });

  it("respeita o limite e inclui eventos de parceiro suspenso", async () => {
    expect(await repo.searchAll(tag, 2)).toHaveLength(2);
    await db`insert into platform.suspended_owners (owner_id) values (${owner})`;
    expect(await repo.searchAll(tag, 50)).toHaveLength(4);
  });
});
