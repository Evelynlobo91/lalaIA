import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { MissionDraft, MissionRecord } from "../domain/mission";
import { PostgresMissionRepository } from "./postgres-mission-repository";
import { PostgresSurpriseOfferRepository } from "./postgres-surprise-offer-repository";
import { PostgresUserMissionRepository } from "./postgres-user-mission-repository";

const db = sql();
const missions = new PostgresMissionRepository(db);
const offers = new PostgresSurpriseOfferRepository(db);
const userMissions = new PostgresUserMissionRepository(db);
const parceiro = crypto.randomUUID();
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
let surpresa: MissionRecord;
let outra: MissionRecord;
let comum: MissionRecord;

const draft = (title: string, surprise: boolean): MissionDraft => ({
  title,
  description: "Missão inesperada no Centro de Joinville.",
  xp: 100,
  startsAt: new Date(Date.now() - 86_400_000),
  endsAt: new Date(Date.now() + 7 * 86_400_000),
  surprise,
  steps: [{ title: "Peça um espresso", placeId: crypto.randomUUID(), validation: "qr" }],
});

const in30 = () => new Date(Date.now() + 30 * 60_000);

beforeAll(async () => {
  for (const id of [parceiro, ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`sp-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${parceiro}, 'partner')`;
  surpresa = await missions.create(parceiro, draft(`Surpresa ${parceiro}`, true));
  outra = await missions.create(parceiro, draft(`Outra surpresa ${parceiro}`, true));
  comum = await missions.create(parceiro, draft(`Comum ${parceiro}`, false));
});

afterAll(async () => {
  await db`delete from auth.users where id in (${parceiro}, ${ana}, ${bia})`;
  await db.end();
});

describe("missões surpresa no catálogo", () => {
  it("ficam fora da lista pública e aparecem só em listAvailableSurprises", async () => {
    const now = new Date();
    const publicIds = (await missions.listAvailable(now, 500)).map((m) => m.id);
    const surpriseIds = (await missions.listAvailableSurprises(now, 500)).map((m) => m.id);
    expect(publicIds).toContain(comum.id);
    expect(publicIds).not.toContain(surpresa.id);
    expect(surpriseIds).toEqual(expect.arrayContaining([surpresa.id, outra.id]));
    expect(surpriseIds).not.toContain(comum.id);
    expect((await missions.findById(surpresa.id))?.surprise).toBe(true);
  });
});

describe("tempo estimado e gasto por pessoa (#64)", () => {
  it("grava, lê e o banco recusa valores fora da faixa", async () => {
    const criada = await missions.create(parceiro, { ...draft(`Com custo ${parceiro}`, false), estimatedMinutes: 90, costCents: 1250 });
    expect(await missions.findById(criada.id)).toMatchObject({ estimatedMinutes: 90, costCents: 1250 });
    expect((await missions.findById(comum.id))?.estimatedMinutes).toBeNull();
    await expect(db`update missions.missions set estimated_minutes = 5 where id = ${criada.id}`).rejects.toThrow(/check constraint/);
    await expect(db`update missions.missions set cost_cents = -1 where id = ${criada.id}`).rejects.toThrow(/check constraint/);
  });
});

describe("ofertas (missions.surprise_offers, RLS)", () => {
  it("sem oferta aberta, o banco recusa aceitar a missão surpresa", async () => {
    await expect(userMissions.accept(ana, surpresa.id)).rejects.toThrow(/row-level security/);
    // Missão comum continua aceitável.
    expect((await userMissions.accept(bia, comum.id)).status).toBe("active");
  });

  it("oferta é única por pessoa e missão; validade de no máximo 2 h; nunca da própria nem de missão comum", async () => {
    const offer = await offers.create(ana, surpresa.id, in30());
    expect(offer).toMatchObject({ userId: ana, missionId: surpresa.id, status: "offered" });
    expect((await offers.create(ana, surpresa.id, in30())).id).toBe(offer.id);
    expect(await offers.offeredMissionIds(ana)).toEqual(new Set([surpresa.id]));

    await expect(offers.create(ana, outra.id, new Date(Date.now() + 3 * 3_600_000))).rejects.toThrow(/row-level security|check constraint/);
    await expect(offers.create(ana, comum.id, in30())).rejects.toThrow(/row-level security/);
    await expect(offers.create(parceiro, surpresa.id, in30())).rejects.toThrow(/row-level security/);
    // Em nome de outra pessoa.
    await expect(asUser(ana, (tx) => tx`insert into missions.surprise_offers (user_id, mission_id, expires_at) values (${bia}, ${outra.id}, ${in30()})`, db)).rejects.toThrow(/row-level security/);
    // Outra pessoa não vê a oferta da Ana.
    expect(await offers.find(bia, surpresa.id)).toBeNull();
    expect((await offers.listOpen(ana, new Date())).map((o) => o.missionId)).toEqual([surpresa.id]);
  });

  it("aceitar cria o aceite e fecha a oferta na mesma transação; não dá para reabrir", async () => {
    const um = await offers.accept(ana, surpresa.id);
    expect(um).toMatchObject({ userId: ana, missionId: surpresa.id, status: "active" });
    expect((await offers.find(ana, surpresa.id))?.status).toBe("accepted");
    expect(await offers.listOpen(ana, new Date())).toEqual([]);
    await expect(asUser(ana, (tx) => tx`update missions.surprise_offers set status = 'offered', responded_at = null where user_id = ${ana}`, db)).resolves.toHaveProperty("count", 0);
  });

  it("ignorar fecha a oferta; oferta vencida não deixa aceitar", async () => {
    await offers.create(bia, surpresa.id, in30());
    await offers.dismiss(bia, surpresa.id);
    expect((await offers.find(bia, surpresa.id))?.status).toBe("dismissed");
    await expect(userMissions.accept(bia, surpresa.id)).rejects.toThrow(/row-level security/);

    await offers.create(bia, outra.id, in30());
    // Simula a oferta vencida (como superusuário, fora da RLS).
    await db`update missions.surprise_offers set offered_at = now() - interval '1 hour', expires_at = now() - interval '1 minute' where user_id = ${bia} and mission_id = ${outra.id}`;
    await expect(offers.accept(bia, outra.id)).rejects.toThrow(/row-level security/);
  });
});
