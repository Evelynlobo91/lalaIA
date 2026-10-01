import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { MissionDraft, MissionRecord } from "../domain/mission";
import type { UserMission } from "../domain/user-mission";
import { PostgresMissionRepository } from "./postgres-mission-repository";
import { PostgresStepCompletionRepository } from "./postgres-step-completion-repository";
import { PostgresUserMissionRepository } from "./postgres-user-mission-repository";

const db = sql();
const missions = new PostgresMissionRepository(db);
const userMissions = new PostgresUserMissionRepository(db);
const completions = new PostgresStepCompletionRepository(db);
const parceiro = crypto.randomUUID();
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
let rota: MissionRecord;
let outra: MissionRecord;
let anaRota: UserMission;
let biaRota: UserMission;

const draft = (title: string): MissionDraft => ({
  title,
  description: "Conheça os cafés do Centro de Joinville.",
  xp: 100,
  startsAt: new Date(Date.now() - 86_400_000),
  endsAt: new Date(Date.now() + 7 * 86_400_000),
  steps: [
    { title: "Peça um espresso", placeId: crypto.randomUUID(), validation: "qr" },
    { title: "Prove o bolo", placeId: crypto.randomUUID(), validation: "qr" },
  ],
});

const insertCompletion = (userId: string, userMissionId: string, stepId: string) =>
  asUser(userId, (tx) => tx`insert into missions.step_completions (user_mission_id, step_id, user_id) values (${userMissionId}, ${stepId}, ${userId})`, db);
const completeMission = (userId: string, userMissionId: string) =>
  asUser(userId, (tx) => tx`update missions.user_missions set status = 'completed', completed_at = now() where id = ${userMissionId}`, db);

beforeAll(async () => {
  for (const id of [parceiro, ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`sc-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${parceiro}, 'partner')`;
  rota = await missions.create(parceiro, draft("Rota do Café"));
  outra = await missions.create(parceiro, draft("Outra Rota"));
  anaRota = await userMissions.accept(ana, rota.id);
  biaRota = await userMissions.accept(bia, rota.id);
});

afterAll(async () => {
  await db`delete from auth.users where id in (${parceiro}, ${ana}, ${bia})`;
  await db.end();
});

describe("etapas concluídas (RLS, append-only)", () => {
  it("só conclui etapa da própria missão aceita, e etapa dessa missão", async () => {
    // Etapa de outra missão na missão aceita.
    await expect(insertCompletion(ana, anaRota.id, outra.steps[0].id)).rejects.toThrow(/row-level security/);
    // Na missão aceita por outra pessoa.
    await expect(insertCompletion(ana, biaRota.id, rota.steps[0].id)).rejects.toThrow(/row-level security/);
    // Válida: etapa da própria missão aceita.
    expect((await insertCompletion(ana, anaRota.id, rota.steps[0].id)).count).toBe(1);
    // Em nome de outra pessoa.
    await expect(asUser(ana, (tx) => tx`insert into missions.step_completions (user_mission_id, step_id, user_id) values (${biaRota.id}, ${rota.steps[1].id}, ${bia})`, db)).rejects.toThrow(
      /row-level security/,
    );
  });

  it("a mesma etapa não conta duas vezes (unique) e não dá para apagar nem alterar", async () => {
    await expect(insertCompletion(ana, anaRota.id, rota.steps[0].id)).rejects.toThrow(/duplicate key/);
    await expect(asUser(ana, (tx) => tx`delete from missions.step_completions where user_mission_id = ${anaRota.id}`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(ana, (tx) => tx`update missions.step_completions set completed_at = now() where user_mission_id = ${anaRota.id}`, db)).rejects.toThrow(/permission denied/);
  });

  it("usuário não vê as conclusões de outra pessoa; contagem por missão aceita", async () => {
    expect((await completions.listFor(ana, anaRota.id)).map((c) => c.stepId)).toEqual([rota.steps[0].id]);
    expect(await completions.listFor(bia, anaRota.id)).toEqual([]);
    expect((await completions.countsByUserMission(ana)).get(anaRota.id)).toBe(1);
    expect((await completions.countsByUserMission(bia)).size).toBe(0);
  });

  it("missão só vira concluída com todas as etapas, e só pela própria pessoa", async () => {
    await expect(completeMission(ana, anaRota.id)).rejects.toThrow(/row-level security/);
    await insertCompletion(ana, anaRota.id, rota.steps[1].id);
    expect((await completeMission(bia, anaRota.id)).count).toBe(0);
    expect((await completeMission(ana, anaRota.id)).count).toBe(1);
    expect(await userMissions.find(ana, rota.id)).toMatchObject({ status: "completed" });
    // Concluída: nada mais entra.
    await expect(insertCompletion(ana, anaRota.id, rota.steps[1].id)).rejects.toThrow(/row-level security|duplicate key/);
  });
});
