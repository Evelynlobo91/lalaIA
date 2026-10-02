import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placeSummaries, placesManagedBy } from "@/modules/places";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { MissionDraft } from "../domain/mission";
import { SaveMission } from "../features/manage-missions/manage-missions.use-cases";
import { PostgresMissionRepository } from "./postgres-mission-repository";

const db = sql();
const repo = new PostgresMissionRepository(db);
const parceiro = crypto.randomUUID();
const outroParceiro = crypto.randomUUID();
const comum = crypto.randomUUID();
const admin = crypto.randomUUID();
const placeIds: string[] = [];
let meuCafe: string;
let meuBar: string;
let cafeAlheio: string;

const draft = (patch: Partial<MissionDraft> = {}): MissionDraft => ({
  title: "Rota do Café",
  description: "Conheça os cafés do Centro de Joinville.",
  xp: 100,
  startsAt: new Date("2030-10-01T11:00:00Z"),
  endsAt: new Date("2030-11-01T11:00:00Z"),
  steps: [
    { title: "Peça um espresso", placeId: meuCafe, validation: "qr" },
    { title: "Prove o chope", placeId: meuBar, validation: "qr" },
  ],
  ...patch,
});

async function createPlace(name: string, managedBy: string | null) {
  const [row] = await db<{ id: string }[]>`
    insert into places.places (source, source_id, name, category, location, managed_by)
    values ('osm', ${`teste-missoes/${crypto.randomUUID()}`}, ${name}, 'cafes', extensions.st_makepoint(-48.84, -26.3)::extensions.geography, ${managedBy})
    returning id`;
  placeIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  for (const id of [parceiro, outroParceiro, comum, admin]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`ms-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${parceiro}, 'partner'), (${outroParceiro}, 'partner'), (${admin}, 'admin')`;
  meuCafe = await createPlace("Café do Parceiro", parceiro);
  meuBar = await createPlace("Bar do Parceiro", parceiro);
  cafeAlheio = await createPlace("Café de Outro", outroParceiro);
});

afterAll(async () => {
  await db`delete from places.places where id in ${db(placeIds)}`;
  await db`delete from auth.users where id in (${parceiro}, ${outroParceiro}, ${comum}, ${admin})`;
  await db.end();
});

describe("PostgresMissionRepository (com RLS)", () => {
  it("parceiro cria, edita (etapas mantêm o id por posição) e encerra a própria missão", async () => {
    const created = await repo.create(parceiro, draft());
    expect(created).toMatchObject({ ownerId: parceiro, status: "active", xp: 100 });
    expect(created.steps.map((s) => [s.position, s.title])).toEqual([
      [1, "Peça um espresso"],
      [2, "Prove o chope"],
    ]);

    const updated = await repo.update(parceiro, created.id, draft({ title: "Rota do Café e do Chope", steps: [{ title: "Peça um cappuccino", placeId: meuCafe, validation: "qr" }] }), { saveSteps: true });
    expect(updated?.title).toBe("Rota do Café e do Chope");
    expect(updated?.steps).toHaveLength(1);
    expect(updated?.steps[0]).toMatchObject({ id: created.steps[0].id, title: "Peça um cappuccino" });

    expect(await repo.archive(parceiro, created.id)).toMatchObject({ status: "archived" });
    expect(await repo.update(parceiro, created.id, draft(), { saveSteps: true })).toBeNull();
  });

  it("usuário comum não cria missão (só parceiro ou admin)", async () => {
    await expect(repo.create(comum, draft())).rejects.toThrow(/row-level security/);
  });

  it("outro parceiro não edita, não encerra nem mexe nas etapas; admin modera", async () => {
    const created = await repo.create(parceiro, draft());
    expect(await repo.update(outroParceiro, created.id, draft({ title: "Hackeada" }), { saveSteps: true })).toBeNull();
    expect(await repo.archive(outroParceiro, created.id)).toBeNull();
    const del = await asUser(outroParceiro, (tx) => tx`delete from missions.mission_steps where mission_id = ${created.id}`, db);
    expect(del.count).toBe(0);
    await expect(
      asUser(outroParceiro, (tx) => tx`insert into missions.mission_steps (mission_id, position, title, place_id) values (${created.id}, 9, 'Intrusa', ${cafeAlheio})`, db),
    ).rejects.toThrow(/row-level security/);
    expect(await repo.archive(admin, created.id)).toMatchObject({ status: "archived" });
  });

  it("dono não transfere a missão para outra pessoa", async () => {
    const created = await repo.create(parceiro, draft());
    await expect(asUser(parceiro, (tx) => tx`update missions.missions set owner_id = ${outroParceiro} where id = ${created.id}`, db)).rejects.toThrow(/permission denied/);
  });

  it("o banco recusa fim antes do início e XP fora da faixa", async () => {
    await expect(repo.create(parceiro, draft({ endsAt: new Date("2030-09-01T00:00:00Z") }))).rejects.toThrow(/check/);
    await expect(repo.create(parceiro, draft({ xp: 5 }))).rejects.toThrow(/check/);
  });

  it("caso de uso com a API real de places: parceiro não cria missão em lugar que não administra", async () => {
    const save = new SaveMission(repo, { summaries: placeSummaries, managedBy: placesManagedBy }, { hasParticipants: async () => false });
    const author = { id: parceiro, isPartner: true, isAdmin: false };
    const res = await save.execute(author, undefined, draft({ steps: [{ title: "Peça um café", placeId: cafeAlheio, validation: "qr" }] }));
    expect(!res.ok && res.error.details).toEqual([{ path: ["steps"], message: "Etapa 1: escolha um lugar que você administra." }]);

    const asAdmin = await save.execute({ id: admin, isPartner: false, isAdmin: true }, undefined, draft({ steps: [{ title: "Peça um café", placeId: cafeAlheio, validation: "qr" }] }));
    expect(asAdmin.ok).toBe(true);
  });

  it("lista por dono, da mais recente para a mais antiga, com as etapas", async () => {
    const mine = await repo.listByOwner(parceiro);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((m) => m.ownerId === parceiro && m.steps.length > 0)).toBe(true);
  });
});
