import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { domainEvents } from "@/shared/events";
import { subscriptions } from "../index";
import { PostgresLevelUpRepository } from "./postgres-level-up-repository";

const db = sql();
const repo = new PostgresLevelUpRepository(db);
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();

beforeAll(async () => {
  for (const id of [ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`lvl-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
});

afterAll(async () => {
  // Excluir a conta apaga os níveis em cascata (única exceção ao append-only).
  await db`delete from auth.users where id in (${ana}, ${bia})`;
  const [left] = await db`select count(*)::int as n from progression.level_ups where user_id in (${ana}, ${bia})`;
  expect(left.n).toBe(0);
  await db.end();
});

describe("PostgresLevelUpRepository (append-only, RLS)", () => {
  it("registra cada nível uma vez só e devolve o último", async () => {
    expect(await repo.record(ana, 2)).toBe(true);
    expect(await repo.record(ana, 2)).toBe(false);
    expect(await repo.record(ana, 3)).toBe(true);
    expect(await repo.latest(ana)).toMatchObject({ level: 3, reachedAt: expect.any(Date) });
  });

  it("cada pessoa só lê os próprios níveis; ninguém grava como usuário", async () => {
    expect(await repo.latest(bia)).toBeNull();
    expect(await asUser(bia, (tx) => tx`select level from progression.level_ups where user_id = ${ana}`, db)).toHaveLength(0);
    await expect(asUser(bia, (tx) => tx`insert into progression.level_ups (user_id, level) values (${bia}, 7)`, db)).rejects.toThrow(/permission denied/);
  });

  it("append-only também para o backend", async () => {
    await expect(db`update progression.level_ups set level = 7 where user_id = ${ana}`).rejects.toThrow(/append-only/);
    await expect(db`delete from progression.level_ups where user_id = ${ana}`).rejects.toThrow(/append-only/);
  });

  it("assinaturas do módulo: XP creditado sobe o nível e publica LevelReached uma vez", async () => {
    // O módulo publica no bus do processo (XpGranted → LevelReached), então o teste usa o mesmo bus.
    const bus = domainEvents();
    subscriptions(bus);
    const reached: number[] = [];
    bus.subscribe("progression.LevelReached", (e) => void reached.push(e.payload.level));
    const missionId = crypto.randomUUID();
    // 60 + 60 = 120 XP → nível 2. Republicar a mesma etapa não credita nem publica de novo.
    const step = { userId: bia, missionId, stepId: crypto.randomUUID(), xp: 60 };
    await bus.publish("missions.StepCompleted", step);
    await bus.publish("missions.MissionCompleted", { userId: bia, missionId, xp: 60 });
    await bus.publish("missions.StepCompleted", step);
    expect(reached).toEqual([2]);
    expect(await repo.latest(bia)).toMatchObject({ level: 2 });
  });
});
