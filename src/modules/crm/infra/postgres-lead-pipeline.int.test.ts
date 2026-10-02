import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresLeadPipeline } from "./postgres-lead-pipeline";
import { PostgresLeadRepository } from "./postgres-lead-repository";

const db = sql();
const leads = new PostgresLeadRepository(db);
const pipeline = new PostgresLeadPipeline(db);
const commercial = crypto.randomUUID();
const finance = crypto.randomUUID();
const tag = `funil${Date.now()}`;
let leadId: string;

beforeAll(async () => {
  for (const [id, role] of [[commercial, "commercial"], [finance, "finance"]] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${role}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  const lead = await leads.create(commercial, { businessName: `Bar ${tag}`, contactName: "José", contactPhone: "47999990000", contactEmail: null, source: "visita", ownerId: commercial });
  leadId = lead.id;
});

afterAll(async () => {
  await db`delete from crm.leads where business_name like ${`%${tag}%`}`;
  await db`delete from auth.users where id in (${commercial}, ${finance})`;
  await db.end();
});

describe("PostgresLeadPipeline (#148)", () => {
  it("move o lead e registra a mudança no histórico, com quem moveu", async () => {
    expect(await pipeline.move(commercial, leadId, "lead", "contato", null)).toMatchObject({ stage: "contato", lostReason: null });
    expect(await pipeline.history(commercial, leadId)).toMatchObject([{ from: "lead", to: "contato", changedBy: commercial, reason: null }]);
  });

  it("se o lead já saiu da etapa de origem, nada muda e nada entra no histórico", async () => {
    expect(await pipeline.move(commercial, leadId, "lead", "proposta", null)).toBeNull();
    expect((await leads.findById(commercial, leadId))?.stage).toBe("contato");
    expect(await pipeline.history(commercial, leadId)).toHaveLength(1);
  });

  it("perdido grava o motivo no lead e no histórico; reabrir limpa o motivo do lead", async () => {
    expect(await pipeline.move(commercial, leadId, "contato", "perdido", "Fechou com o concorrente.")).toMatchObject({ stage: "perdido", lostReason: "Fechou com o concorrente." });
    expect(await pipeline.move(commercial, leadId, "perdido", "lead", null)).toMatchObject({ stage: "lead", lostReason: null });

    const history = await pipeline.history(commercial, leadId);
    expect(history.map((c) => `${c.from}>${c.to}`)).toEqual(["perdido>lead", "contato>perdido", "lead>contato"]);
    expect(history[1].reason).toBe("Fechou com o concorrente.");
  });

  it("perda sem motivo é barrada pelo banco, e a mudança inteira é desfeita", async () => {
    await expect(pipeline.move(commercial, leadId, "lead", "perdido", null)).rejects.toThrow(/check/);
    expect((await leads.findById(commercial, leadId))?.stage).toBe("lead");
    expect(await pipeline.history(commercial, leadId)).toHaveLength(3);
  });

  it("quem não cuida de leads não move nem vê o histórico (RLS)", async () => {
    expect(await pipeline.move(finance, leadId, "lead", "contato", null)).toBeNull();
    expect(await pipeline.history(finance, leadId)).toHaveLength(0);
    expect((await leads.findById(commercial, leadId))?.stage).toBe("lead");
  });

  it("o histórico não pode ser alterado; some junto com o lead", async () => {
    await expect(db`update crm.lead_stage_history set reason = 'Reescrito' where lead_id = ${leadId}`).rejects.toThrow(/append-only/);
    const temp = await leads.create(commercial, { businessName: `Temp ${tag}`, contactName: "Ana", contactPhone: "47999990001", contactEmail: null, source: "outro", ownerId: commercial });
    await pipeline.move(commercial, temp.id, "lead", "contato", null);
    await db`delete from crm.leads where id = ${temp.id}`;
    const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from crm.lead_stage_history where lead_id = ${temp.id}`;
    expect(n).toBe(0);
  });
});
