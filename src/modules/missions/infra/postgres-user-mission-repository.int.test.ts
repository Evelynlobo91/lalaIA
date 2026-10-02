import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { MissionDraft, MissionRecord } from "../domain/mission";
import { PostgresMissionRepository } from "./postgres-mission-repository";
import { PostgresUserMissionRepository } from "./postgres-user-mission-repository";

const db = sql();
const missions = new PostgresMissionRepository(db);
const userMissions = new PostgresUserMissionRepository(db);
const parceiro = crypto.randomUUID();
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
let available: MissionRecord;
let future: MissionRecord;
let archived: MissionRecord;

const draft = (patch: Partial<MissionDraft> = {}): MissionDraft => ({
  title: "Rota do Café",
  description: "Conheça os cafés do Centro de Joinville.",
  xp: 100,
  startsAt: new Date(Date.now() - 86_400_000),
  endsAt: new Date(Date.now() + 7 * 86_400_000),
  steps: [
    { title: "Peça um espresso", placeId: crypto.randomUUID(), validation: "qr" },
    { title: "Prove o bolo", placeId: crypto.randomUUID(), validation: "qr" },
  ],
  ...patch,
});

beforeAll(async () => {
  for (const id of [parceiro, ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`um-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${parceiro}, 'partner')`;
  available = await missions.create(parceiro, draft());
  future = await missions.create(parceiro, draft({ startsAt: new Date(Date.now() + 86_400_000) }));
  archived = await missions.create(parceiro, draft());
  await missions.archive(parceiro, archived.id);
});

afterAll(async () => {
  await db`delete from auth.users where id in (${parceiro}, ${ana}, ${bia})`;
  await db.end();
});

describe("PostgresUserMissionRepository (com RLS)", () => {
  it("aceita uma vez só (idempotente) e conta as ativas", async () => {
    const first = await userMissions.accept(ana, available.id);
    const again = await userMissions.accept(ana, available.id);
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({ userId: ana, missionId: available.id, status: "active", completedAt: null });
    expect(await userMissions.countActive(ana)).toBe(1);
    expect((await userMissions.listByUser(ana)).map((m) => m.missionId)).toEqual([available.id]);
  });

  it("usuário não vê nem cria aceite de outra pessoa", async () => {
    expect(await userMissions.find(bia, available.id)).toBeNull();
    const seen = await asUser(bia, (tx) => tx`select id from missions.user_missions where user_id = ${ana}`, db);
    expect(seen).toHaveLength(0);
    await expect(asUser(bia, (tx) => tx`insert into missions.user_missions (user_id, mission_id) values (${ana}, ${future.id})`, db)).rejects.toThrow(/row-level security/);
  });

  it("o banco não deixa aceitar missão fora da janela ou encerrada, nem já como concluída", async () => {
    await expect(userMissions.accept(bia, future.id)).rejects.toThrow(/row-level security/);
    await expect(userMissions.accept(bia, archived.id)).rejects.toThrow(/row-level security/);
    await expect(
      asUser(bia, (tx) => tx`insert into missions.user_missions (user_id, mission_id, status, completed_at) values (${bia}, ${available.id}, 'completed', now())`, db),
    ).rejects.toThrow(/row-level security/);
  });

  it("depois do primeiro aceite, etapas e XP ficam travados no banco (título ainda muda)", async () => {
    expect(await userMissions.hasParticipants(available.id)).toBe(true);
    expect(await userMissions.hasParticipants(future.id)).toBe(false);

    const del = await asUser(parceiro, (tx) => tx`delete from missions.mission_steps where mission_id = ${available.id}`, db);
    expect(del.count).toBe(0);
    await expect(missions.update(parceiro, available.id, draft({ xp: 300 }), { saveSteps: false })).rejects.toThrow(/XP não pode mudar/);
    const renamed = await missions.update(parceiro, available.id, draft({ title: "Rota do Café II", xp: 100 }), { saveSteps: false });
    expect(renamed?.title).toBe("Rota do Café II");
    expect(renamed?.steps).toHaveLength(2);
  });

  it("lista as disponíveis agora (sem futuras nem encerradas)", async () => {
    const ids = (await missions.listAvailable(new Date(), 500)).map((m) => m.id);
    expect(ids).toContain(available.id);
    expect(ids).not.toContain(future.id);
    expect(ids).not.toContain(archived.id);
  });
});
