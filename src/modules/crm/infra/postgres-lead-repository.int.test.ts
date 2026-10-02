import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { LeadData } from "../domain/lead";
import { PostgresLeadRepository } from "./postgres-lead-repository";

const db = sql();
const repo = new PostgresLeadRepository(db);
const ids = { commercial: crypto.randomUUID(), admin: crypto.randomUUID(), finance: crypto.randomUUID(), moderator: crypto.randomUUID(), nobody: crypto.randomUUID() };
const tag = `lead${Date.now()}`;

const data = (patch: Partial<LeadData> = {}): LeadData => ({
  businessName: `Bar ${tag}`,
  contactName: "José",
  contactPhone: "47999990000",
  contactEmail: null,
  source: "visita",
  ownerId: ids.commercial,
  ...patch,
});

beforeAll(async () => {
  for (const [name, id] of Object.entries(ids)) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${name}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    if (name !== "nobody") await db`insert into identity.user_roles (user_id, role) values (${id}, ${name})`;
  }
});

afterAll(async () => {
  await db`delete from crm.leads where business_name like ${`%${tag}%`}`;
  await db`delete from auth.users where id in ${db(Object.values(ids))}`;
  await db.end();
});

describe("PostgresLeadRepository (RLS por capacidade, #147)", () => {
  let leadId: string;

  it("comercial cadastra um lead, que nasce na etapa 'lead'", async () => {
    const created = await repo.create(ids.commercial, data());
    leadId = created.id;
    expect(created).toMatchObject({ businessName: `Bar ${tag}`, stage: "lead", lostReason: null, ownerId: ids.commercial, source: "visita" });
  });

  it("admin também lê e edita; a lista traz os mais recentemente atualizados primeiro", async () => {
    const second = await repo.create(ids.admin, data({ businessName: `Café ${tag}`, contactPhone: null, contactEmail: "cafe@exemplo.com" }));
    const updated = await repo.update(ids.admin, leadId, data({ contactName: "José Silva" }));
    expect(updated?.contactName).toBe("José Silva");

    const ours = (await repo.list(ids.commercial, 200)).filter((l) => l.businessName.includes(tag));
    expect(ours.map((l) => l.id)).toEqual([leadId, second.id]);
    expect((await repo.findById(ids.commercial, second.id))?.contactEmail).toBe("cafe@exemplo.com");
  });

  it("financeiro, moderação e usuário comum não veem nem alteram leads", async () => {
    for (const outsider of [ids.finance, ids.moderator, ids.nobody]) {
      expect(await repo.list(outsider, 200)).toHaveLength(0);
      expect(await repo.findById(outsider, leadId)).toBeNull();
      expect(await repo.update(outsider, leadId, data({ businessName: `Invadido ${tag}` }))).toBeNull();
      await expect(repo.create(outsider, data())).rejects.toThrow(/row-level security/);
    }
    expect((await repo.findById(ids.commercial, leadId))?.businessName).toBe(`Bar ${tag}`);
  });

  it("ninguém cadastra em nome de outra pessoa", async () => {
    await expect(
      asUser(
        ids.commercial,
        (tx) => tx`insert into crm.leads (business_name, contact_name, contact_phone, source, owner_id, created_by)
                   values (${`Forjado ${tag}`}, 'X Y', '47999990000', 'outro', ${ids.commercial}, ${ids.admin})`,
        db,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("o banco exige contato, origem conhecida e motivo para lead perdido", async () => {
    await expect(repo.create(ids.commercial, data({ contactPhone: null, contactEmail: null }))).rejects.toThrow(/check/);
    await expect(repo.create(ids.commercial, data({ source: "tiktok" as LeadData["source"] }))).rejects.toThrow(/check/);
    await expect(db`update crm.leads set stage = 'perdido' where id = ${leadId}`).rejects.toThrow(/check/);
  });

  it("excluir a conta do responsável deixa o lead sem responsável, sem apagar o lead", async () => {
    const temp = crypto.randomUUID();
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${temp}, ${`${tag}-temp@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    const orphan = await repo.create(ids.commercial, data({ businessName: `Órfão ${tag}`, ownerId: temp }));
    await db`delete from auth.users where id = ${temp}`;
    expect(await repo.findById(ids.commercial, orphan.id)).toMatchObject({ ownerId: null, businessName: `Órfão ${tag}` });
  });
});
