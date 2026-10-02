import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { InMemoryEventBus } from "@/shared/events";
import { subscriptions } from "../index";
import type { NewXpTransaction } from "../domain/xp";
import { PostgresXpLedger } from "./postgres-xp-ledger";

const db = sql();
const ledger = new PostgresXpLedger(db);
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();

const entry = (patch: Partial<NewXpTransaction> = {}): NewXpTransaction => ({
  userId: ana,
  amount: 30,
  reason: "mission_step",
  sourceId: crypto.randomUUID(),
  description: "Etapa concluída · Rota do Café",
  eventId: crypto.randomUUID(),
  ...patch,
});

beforeAll(async () => {
  for (const id of [ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`xp-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
});

afterAll(async () => {
  // Excluir a conta apaga o livro em cascata (única exceção ao append-only).
  await db`delete from auth.users where id in (${ana}, ${bia})`;
  const [left] = await db`select count(*)::int as n from progression.xp_transactions where user_id in (${ana}, ${bia})`;
  expect(left.n).toBe(0);
  await db.end();
});

describe("PostgresXpLedger (append-only, RLS)", () => {
  it("credita e soma o saldo; o mesmo evento ou a mesma origem não duplicam", async () => {
    const first = entry();
    expect(await ledger.append(first)).toBe(true);
    expect(await ledger.append(first)).toBe(false);
    expect(await ledger.append({ ...first, eventId: crypto.randomUUID() })).toBe(false);
    expect(await ledger.append(entry({ reason: "mission_completed", amount: 25 }))).toBe(true);
    expect(await ledger.balanceOf(ana)).toBe(55);
    expect((await ledger.history(ana, 10)).map((t) => t.amount).sort()).toEqual([25, 30]);
  });

  it("usuário só lê as próprias transações e o próprio saldo", async () => {
    expect(await ledger.balanceOf(bia)).toBe(0);
    expect(await ledger.history(bia, 10)).toEqual([]);
    const seen = await asUser(bia, (tx) => tx`select id from progression.xp_transactions where user_id = ${ana}`, db);
    expect(seen).toHaveLength(0);
  });

  it("ninguém grava, altera ou apaga como usuário", async () => {
    await expect(
      asUser(bia, (tx) => tx`insert into progression.xp_transactions (user_id, amount, reason, source_id, description, event_id) values (${bia}, 9999, 'mission_step', ${crypto.randomUUID()}, 'forjado', ${crypto.randomUUID()})`, db),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(ana, (tx) => tx`update progression.xp_transactions set amount = 9999 where user_id = ${ana}`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(ana, (tx) => tx`delete from progression.xp_transactions where user_id = ${ana}`, db)).rejects.toThrow(/permission denied/);
  });

  it("append-only também para o backend: update e delete são bloqueados", async () => {
    await expect(db`update progression.xp_transactions set amount = 9999 where user_id = ${ana}`).rejects.toThrow(/append-only/);
    await expect(db`delete from progression.xp_transactions where user_id = ${ana}`).rejects.toThrow(/append-only/);
    expect(await ledger.balanceOf(ana)).toBe(55);
  });

  it("assinaturas do módulo: evento publicado duas vezes credita uma vez só", async () => {
    const bus = new InMemoryEventBus({ onHandlerError: (e) => { throw e; } });
    subscriptions(bus);
    const payload = { userId: bia, missionId: crypto.randomUUID(), stepId: crypto.randomUUID(), xp: 40 };
    await bus.publish("missions.StepCompleted", payload);
    await bus.publish("missions.StepCompleted", payload);
    await bus.publish("missions.MissionCompleted", { userId: bia, missionId: payload.missionId, xp: 20 });
    expect(await ledger.balanceOf(bia)).toBe(60);
    // Missão inexistente no módulo missions: crédito com o rótulo genérico.
    expect((await ledger.history(bia, 10)).map((t) => t.description).sort()).toEqual(["Etapa concluída", "Missão concluída"]);
  });
});
