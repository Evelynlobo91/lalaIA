import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { createSql, sql } from "@/shared/db/sql";
import { InMemoryEventBus } from "@/shared/events";
import { generateShortCode } from "@/shared/kernel/short-code";
import type { MissionDraft, MissionRecord, ValidationKind } from "../domain/mission";
import { ClaimMissionReward } from "../features/rewards/rewards.use-case";
import { PostgresMissionRepository } from "./postgres-mission-repository";
import { PostgresMissionRewardRepository, PostgresRewardClaimRepository } from "./postgres-reward-repository";
import { PostgresUserMissionRepository } from "./postgres-user-mission-repository";

const db = sql();
const missions = new PostgresMissionRepository(db);
const userMissions = new PostgresUserMissionRepository(db);
const rewards = new PostgresMissionRewardRepository(db);
const claims = new PostgresRewardClaimRepository(db);
const dono = crypto.randomUUID();
const outro = crypto.randomUUID();
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const multidao = Array.from({ length: 12 }, () => crypto.randomUUID());
const users = [dono, outro, ana, bia, ...multidao];

const draft = (validations: ValidationKind[] = ["qr", "qr_gps"]): MissionDraft => ({
  title: "Rota do Chope",
  description: "Conheça as cervejarias do Centro de Joinville.",
  xp: 100,
  startsAt: new Date(Date.now() - 86_400_000),
  endsAt: new Date(Date.now() + 7 * 86_400_000),
  steps: validations.map((validation, i) => ({
    title: `Etapa ${i + 1}`,
    placeId: crypto.randomUUID(),
    validation,
    geofence: validation === "qr" ? null : { radiusMeters: 100, dwellMinutes: validation === "gps" ? 2 : 0 },
  })),
});

/** Aceita e conclui a missão como a pessoa (pela RLS, como o CompleteStep faz). */
async function complete(userId: string, mission: MissionRecord, db0 = db) {
  const um = await userMissions.accept(userId, mission.id);
  await asUser(
    userId,
    async (tx) => {
      for (const step of mission.steps) await tx`insert into missions.step_completions (user_mission_id, step_id, user_id) values (${um.id}, ${step.id}, ${userId})`;
      await tx`update missions.user_missions set status = 'completed', completed_at = now() where id = ${um.id}`;
    },
    db0,
  );
}

beforeAll(async () => {
  for (const id of users) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`rw-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${dono}, 'partner'), (${outro}, 'partner')`;
});

afterAll(async () => {
  await db`delete from auth.users where id = any(${users}::uuid[])`;
  await db.end();
});

describe("recompensa da missão (com RLS)", () => {
  it("o parceiro dono vincula e edita; outro parceiro não; o contador é intocável", async () => {
    const mission = await missions.create(dono, draft());
    const saved = await rewards.save(dono, mission.id, { description: "1 chope grátis", stock: 10 });
    expect(saved).toMatchObject({ missionId: mission.id, description: "1 chope grátis", stock: 10, claimedCount: 0 });
    expect((await rewards.save(dono, mission.id, { description: "2 chopes", stock: null })).stock).toBeNull();
    expect((await rewards.find(mission.id))?.description).toBe("2 chopes");

    await expect(rewards.save(outro, mission.id, { description: "Invadido", stock: null })).rejects.toThrow(/row-level security/);
    await expect(asUser(dono, (tx) => tx`update missions.mission_rewards set claimed_count = 99 where mission_id = ${mission.id}`, db)).rejects.toThrow(/permission denied/);
  });

  it("missão com etapa só por GPS não recebe recompensa (RLS), e quem não é parceiro também não", async () => {
    const gps = await missions.create(dono, draft(["qr", "gps"]));
    await expect(rewards.save(dono, gps.id, { description: "1 chope grátis", stock: null })).rejects.toThrow(/row-level security/);

    const mission = await missions.create(dono, draft());
    await db`delete from identity.user_roles where user_id = ${dono} and role = 'partner'`;
    try {
      await expect(rewards.save(dono, mission.id, { description: "1 chope grátis", stock: null })).rejects.toThrow(/row-level security/);
    } finally {
      await db`insert into identity.user_roles (user_id, role) values (${dono}, 'partner')`;
    }
  });

  it("depois do primeiro resgate a recompensa não muda (trigger)", async () => {
    const mission = await missions.create(dono, draft(["qr"]));
    await rewards.save(dono, mission.id, { description: "1 chope grátis", stock: 5 });
    await complete(ana, mission);
    expect((await claims.claim(ana, mission.id, generateShortCode())).kind).toBe("claimed");
    await expect(rewards.save(dono, mission.id, { description: "Mudou", stock: 5 })).rejects.toThrow(/não pode mais mudar/);
  });
});

describe("resgates (com RLS)", () => {
  let mission: MissionRecord;

  beforeAll(async () => {
    mission = await missions.create(dono, draft());
    await rewards.save(dono, mission.id, { description: "1 chope grátis", stock: 5 });
    await complete(ana, mission);
  });

  it("só quem concluiu resgata; é idempotente e conta uma vez", async () => {
    await userMissions.accept(bia, mission.id); // aceitou, não concluiu
    expect(await claims.claim(bia, mission.id, generateShortCode())).toEqual({ kind: "unavailable" });

    const first = await claims.claim(ana, mission.id, generateShortCode());
    const again = await claims.claim(ana, mission.id, generateShortCode());
    expect(first.kind === "claimed" && first.created).toBe(true);
    expect(again.kind === "claimed" && !again.created && first.kind === "claimed" && again.claim.code === first.claim.code).toBe(true);
    expect((await rewards.find(mission.id))?.claimedCount).toBe(1);
    expect((await claims.listMine(ana)).find((c) => c.missionId === mission.id)).toMatchObject({ missionTitle: "Rota do Chope", description: "1 chope grátis" });
  });

  it("ninguém resgata em nome de outra pessoa, já validado, nem vê o resgate alheio", async () => {
    await expect(asUser(bia, (tx) => tx`insert into missions.reward_claims (mission_id, user_id, code) values (${mission.id}, ${ana}, ${generateShortCode()})`, db)).rejects.toThrow(
      /row-level security/,
    );
    await expect(
      asUser(ana, (tx) => tx`insert into missions.reward_claims (mission_id, user_id, code, validated_at) values (${mission.id}, ${ana}, ${generateShortCode()}, now())`, db),
    ).rejects.toThrow(/permission denied/);
    expect(await asUser(bia, (tx) => tx`select id from missions.reward_claims where user_id = ${ana}`, db)).toHaveLength(0);
    expect(await claims.findMine(bia, mission.id)).toBeNull();
  });

  it("código repetido é detectado (o caso de uso sorteia outro)", async () => {
    const other = await missions.create(dono, draft(["qr"]));
    await rewards.save(dono, other.id, { description: "Pastel grátis", stock: null });
    await complete(bia, other);
    const mine = (await claims.findMine(ana, mission.id))!;
    expect(await claims.claim(bia, other.id, mine.code)).toEqual({ kind: "code_taken" });
  });

  it("validação: só o dono da missão encontra o código, só nesta missão, vale uma vez e grava quem validou", async () => {
    const mine = (await claims.findMine(ana, mission.id))!;
    const otherMission = await missions.create(dono, draft(["qr"]));

    // Outro parceiro: o código "não existe" (RLS).
    expect(await claims.findForOwner(outro, mission.id, mine.code)).toBeNull();
    expect(await claims.markValidated(outro, mine.id)).toBeNull();
    // Mesmo parceiro, outra missão: não encontra.
    expect(await claims.findForOwner(dono, otherMission.id, mine.code)).toBeNull();
    // A pessoa não valida o próprio código.
    expect(await claims.markValidated(ana, mine.id)).toBeNull();

    expect(await claims.findForOwner(dono, mission.id, mine.code)).toMatchObject({ id: mine.id, userId: ana });
    const validated = await claims.markValidated(dono, mine.id);
    expect(validated?.validatedAt).toBeInstanceOf(Date);
    expect(await claims.markValidated(dono, mine.id)).toBeNull();

    const [row] = await db`select validated_by from missions.reward_claims where id = ${mine.id}`;
    expect(row.validated_by).toBe(dono);
    expect(await rewards.countValidated(dono, mission.id)).toBe(1);
    expect(await rewards.countValidated(outro, mission.id)).toBe(0);
  });

  it("o parceiro não altera outras colunas do resgate nem valida em nome de outra pessoa", async () => {
    const other = await missions.create(dono, draft(["qr"]));
    await rewards.save(dono, other.id, { description: "Café grátis", stock: null });
    await complete(ana, other);
    const r = await claims.claim(ana, other.id, generateShortCode());
    const id = r.kind === "claimed" ? r.claim.id : "";
    await expect(asUser(dono, (tx) => tx`update missions.reward_claims set code = 'ZZZZZZZZ' where id = ${id}`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(dono, (tx) => tx`update missions.reward_claims set validated_at = now(), validated_by = ${outro} where id = ${id}`, db)).rejects.toThrow(
      /row-level security/,
    );
  });

  it("missão que passou a ter etapa só por GPS não deixa resgatar (RLS)", async () => {
    const m = await missions.create(dono, draft(["qr"]));
    await rewards.save(dono, m.id, { description: "Chope", stock: null });
    await complete(bia, m);
    // Cenário artificial (as etapas travam depois do aceite): o banco confere de novo no resgate.
    await db`update missions.mission_steps set validation = 'gps', geofence_radius_m = 100, dwell_minutes = 0 where mission_id = ${m.id}`;
    expect(await claims.claim(bia, m.id, generateShortCode())).toEqual({ kind: "unavailable" });
  });
});

describe("estoque sob concorrência", () => {
  it("12 pessoas que concluíram resgatando ao mesmo tempo com estoque 5: exatamente 5 conseguem", async () => {
    const mission = await missions.create(dono, draft(["qr"]));
    await rewards.save(dono, mission.id, { description: "1 chope grátis", stock: 5 });
    for (const u of multidao) await complete(u, mission);

    // Conexões separadas para as transações correrem de fato em paralelo.
    const pool = createSql(process.env.DATABASE_URL!);
    try {
      const parallel = new PostgresRewardClaimRepository(pool);
      const outcomes = await Promise.all(multidao.map((u) => parallel.claim(u, mission.id, generateShortCode())));
      expect(outcomes.filter((o) => o.kind === "claimed")).toHaveLength(5);
      expect(outcomes.filter((o) => o.kind === "sold_out")).toHaveLength(7);
    } finally {
      await pool.end();
    }
    const [{ count }] = await db`select count(*)::int as count from missions.reward_claims where mission_id = ${mission.id}`;
    expect(count).toBe(5);
    expect((await rewards.find(mission.id))?.claimedCount).toBe(5);
    // Esgotar não mexe na missão: todos continuam com ela concluída.
    const [{ done }] = await db`select count(*)::int as done from missions.user_missions where mission_id = ${mission.id} and status = 'completed'`;
    expect(done).toBe(12);
  });

  it("a mesma pessoa tocando várias vezes ao mesmo tempo: um resgate só, contado uma vez", async () => {
    const mission = await missions.create(dono, draft(["qr"]));
    await rewards.save(dono, mission.id, { description: "1 chope grátis", stock: 3 });
    await complete(bia, mission);
    const pool = createSql(process.env.DATABASE_URL!);
    try {
      const parallel = new PostgresRewardClaimRepository(pool);
      const outcomes = await Promise.all(Array.from({ length: 5 }, () => parallel.claim(bia, mission.id, generateShortCode())));
      expect(new Set(outcomes.map((o) => (o.kind === "claimed" ? o.claim.code : o.kind))).size).toBe(1);
    } finally {
      await pool.end();
    }
    expect((await rewards.find(mission.id))?.claimedCount).toBe(1);
  });

  it("caso de uso ponta a ponta: publica o evento só para quem resgatou; o atrasado recebe 'esgotou'", async () => {
    const mission = await missions.create(dono, draft(["qr"]));
    await rewards.save(dono, mission.id, { description: "1 chope grátis", stock: 1 });
    await complete(ana, mission);
    await complete(bia, mission);
    const bus = new InMemoryEventBus();
    const published: string[] = [];
    bus.subscribe("missions.RewardClaimed", (e) => void published.push(e.payload.userId));
    const claim = new ClaimMissionReward(missions, userMissions, rewards, claims, bus);
    expect((await claim.execute(ana, mission.id)).ok).toBe(true);
    const late = await claim.execute(bia, mission.id);
    expect(!late.ok && late.error.code).toBe("reward_sold_out");
    await new Promise((r) => setTimeout(r, 10));
    expect(published).toEqual([ana]);
  });
});

describe("LGPD", () => {
  it("excluir a conta apaga os resgates da pessoa em cascata; a do parceiro leva a recompensa junto", async () => {
    const mission = await missions.create(dono, draft(["qr"]));
    await rewards.save(dono, mission.id, { description: "1 chope grátis", stock: null });
    const temp = crypto.randomUUID();
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${temp}, ${`rw-${temp}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await complete(temp, mission);
    await claims.claim(temp, mission.id, generateShortCode());
    await db`delete from auth.users where id = ${temp}`;
    const [{ count }] = await db`select count(*)::int as count from missions.reward_claims where user_id = ${temp}`;
    expect(count).toBe(0);

    const parceiroTemp = crypto.randomUUID();
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${parceiroTemp}, ${`rw-${parceiroTemp}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${parceiroTemp}, 'partner')`;
    const m2 = await missions.create(parceiroTemp, draft(["qr"]));
    await rewards.save(parceiroTemp, m2.id, { description: "Pastel", stock: null });
    await db`delete from auth.users where id = ${parceiroTemp}`;
    expect(await rewards.find(m2.id)).toBeNull();
  });
});
