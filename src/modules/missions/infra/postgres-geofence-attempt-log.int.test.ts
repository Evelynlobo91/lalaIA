import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { MissionDraft, MissionRecord } from "../domain/mission";
import { PostgresGeofenceAttemptLog } from "./postgres-geofence-attempt-log";
import { PostgresMissionRepository } from "./postgres-mission-repository";

const db = sql();
const missions = new PostgresMissionRepository(db);
const log = new PostgresGeofenceAttemptLog(db);
const parceiro = crypto.randomUUID();
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
let rota: MissionRecord;

const draft = (): MissionDraft => ({
  title: "Passeio com GPS",
  description: "Explore o Centro de Joinville com check-in por GPS.",
  xp: 100,
  startsAt: new Date(Date.now() - 86_400_000),
  endsAt: new Date(Date.now() + 7 * 86_400_000),
  steps: [
    { title: "Peça um espresso", placeId: crypto.randomUUID(), validation: "qr" },
    { title: "Chegue à praça", placeId: crypto.randomUUID(), validation: "gps", geofence: { radiusMeters: 80, dwellMinutes: 5 } },
    { title: "Peça um chope", placeId: crypto.randomUUID(), validation: "qr_gps", geofence: { radiusMeters: 50, dwellMinutes: 7 } },
  ],
});

beforeAll(async () => {
  for (const id of [parceiro, ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`gf-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${parceiro}, 'partner')`;
  rota = await missions.create(parceiro, draft());
});

afterAll(async () => {
  await db`delete from auth.users where id in (${parceiro}, ${ana}, ${bia})`;
  await db.end();
});

describe("geofence das etapas (missions.mission_steps)", () => {
  it("grava e lê o tipo de validação e a geofence; em QR + GPS a permanência vira zero", async () => {
    const saved = await missions.findById(rota.id);
    expect(saved?.steps.map((s) => [s.validation, s.geofence])).toEqual([
      ["qr", null],
      ["gps", { radiusMeters: 80, dwellMinutes: 5 }],
      ["qr_gps", { radiusMeters: 50, dwellMinutes: 0 }],
    ]);
  });

  it("o banco recusa etapa com GPS sem raio e raio fora da faixa", async () => {
    await expect(db`update missions.mission_steps set geofence_radius_m = null, dwell_minutes = null where id = ${rota.steps[1].id}`).rejects.toThrow(/mission_steps_geofence_check/);
    await expect(db`update missions.mission_steps set geofence_radius_m = 1000 where id = ${rota.steps[1].id}`).rejects.toThrow(/check constraint/);
    await expect(db`update missions.mission_steps set validation = 'nfc' where id = ${rota.steps[1].id}`).rejects.toThrow(/mission_steps_validation_check/);
  });
});

describe("tentativas de check-in (missions.geofence_checkins)", () => {
  it("grava só resultado e distância arredondada, e lê as recentes da própria pessoa", async () => {
    const step = rota.steps[1].id;
    const before = new Date(Date.now() - 60_000);
    await log.record(ana, step, { outcome: "outside", distanceMeters: 460 });
    const inside = await log.record(ana, step, { outcome: "inside", distanceMeters: 40 });
    await log.record(ana, step, { outcome: "inaccurate", distanceMeters: null });
    expect(inside).toMatchObject({ outcome: "inside", distanceMeters: 40 });

    const recent = await log.recent(ana, step, before);
    expect(recent.map((a) => a.outcome)).toEqual(["outside", "inside", "inaccurate"]);
    // Outra pessoa não vê as tentativas da Ana (RLS).
    expect(await log.recent(bia, step, before)).toEqual([]);
    expect((await log.listByUser(ana)).length).toBe(3);

    // Nenhuma coluna de coordenada existe na tabela.
    const columns = await db<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'missions' and table_name = 'geofence_checkins'`;
    expect(columns.map((c) => c.column_name).sort()).toEqual(["attempted_at", "distance_m", "id", "outcome", "step_id", "user_id"]);
  });

  it("append-only, em nome próprio, só em etapa com GPS e com o horário do banco", async () => {
    const gps = rota.steps[1].id;
    await expect(asUser(ana, (tx) => tx`delete from missions.geofence_checkins where user_id = ${ana}`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(ana, (tx) => tx`update missions.geofence_checkins set outcome = 'inside' where user_id = ${ana}`, db)).rejects.toThrow(/permission denied/);
    // Em nome de outra pessoa.
    await expect(asUser(ana, (tx) => tx`insert into missions.geofence_checkins (user_id, step_id, outcome, distance_m) values (${bia}, ${gps}, 'inside', 10)`, db)).rejects.toThrow(/row-level security/);
    // Etapa só de QR não recebe check-in.
    await expect(log.record(ana, rota.steps[0].id, { outcome: "inside", distanceMeters: 10 })).rejects.toThrow(/row-level security/);
    // O horário não pode ser forjado (attempted_at fora do grant).
    await expect(asUser(ana, (tx) => tx`insert into missions.geofence_checkins (user_id, step_id, outcome, distance_m, attempted_at) values (${ana}, ${gps}, 'inside', 10, now() - interval '1 hour')`, db)).rejects.toThrow(/permission denied/);
    // Distância não arredondada ou "imprecisa" com distância são recusadas pelo banco.
    await expect(log.record(ana, gps, { outcome: "inside", distanceMeters: 43 })).rejects.toThrow(/check constraint/);
    await expect(log.record(ana, gps, { outcome: "inaccurate", distanceMeters: 40 })).rejects.toThrow(/check constraint/);
  });
});
