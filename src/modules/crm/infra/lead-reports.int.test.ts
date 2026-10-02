import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import type { LeadSource, LeadStage } from "../domain/lead";
import { PostgresLeadRepository } from "./postgres-lead-repository";

const db = sql();
const repo = new PostgresLeadRepository(db);
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const finance = crypto.randomUUID();
const tag = `rel${Date.now()}`;
// Cadastrados numa janela isolada no futuro: as contagens por período não pegam leads de outros testes.
const windowStart = new Date("2038-01-01T00:00:00Z");

const add = async (name: string, source: LeadSource, stage: LeadStage, ownerId: string, createdAt: Date) => {
  await db`insert into crm.leads (business_name, contact_name, contact_phone, source, owner_id, stage, lost_reason, created_by, created_at)
           values (${`${name} ${tag}`}, 'Contato', '47999990000', ${source}, ${ownerId}, ${stage}, ${stage === "perdido" ? "Sem interesse" : null}, ${ana}, ${createdAt})`;
};
const ours = <T extends { businessName: string }>(leads: T[]) => leads.filter((l) => l.businessName.endsWith(tag)).map((l) => l.businessName.replace(` ${tag}`, "")).sort();

beforeAll(async () => {
  for (const [id, role] of [[ana, "commercial"], [bia, "commercial"], [finance, "finance"]] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  const inside = new Date("2038-01-10T12:00:00Z");
  await add("A", "instagram", "ativo", ana, inside);
  await add("B", "instagram", "perdido", ana, inside);
  await add("C", "instagram", "proposta", bia, inside);
  await add("D", "visita", "ativo", bia, inside);
  await add("E", "visita", "lead", ana, new Date("2037-06-01T12:00:00Z")); // antes da janela
});

afterAll(async () => {
  await db`delete from crm.leads where business_name like ${`%${tag}`}`;
  await db`delete from auth.users where id in (${ana}, ${bia}, ${finance})`;
  await db.end();
});

describe("filtros da lista de leads (#151)", () => {
  it("sem filtro traz todos; cada filtro restringe e eles se combinam", async () => {
    expect(ours(await repo.list(ana, 500))).toEqual(["A", "B", "C", "D", "E"]);
    expect(ours(await repo.list(ana, 500, { stage: "ativo" }))).toEqual(["A", "D"]);
    expect(ours(await repo.list(ana, 500, { source: "instagram" }))).toEqual(["A", "B", "C"]);
    expect(ours(await repo.list(ana, 500, { ownerId: bia }))).toEqual(["C", "D"]);
    expect(ours(await repo.list(ana, 500, { source: "instagram", ownerId: ana, stage: "perdido" }))).toEqual(["B"]);
    expect(ours(await repo.list(ana, 500, { source: "outro" }))).toEqual([]);
  });
});

describe("contagem por origem para a taxa de conversão (#151)", () => {
  it("conta total, ativos e perdidos por origem, só entre os leads cadastrados desde a data", async () => {
    const counts = await repo.countsBySource(ana, windowStart);
    expect(counts.find((c) => c.source === "instagram")).toEqual({ source: "instagram", total: 3, active: 1, lost: 1 });
    expect(counts.find((c) => c.source === "visita")).toEqual({ source: "visita", total: 1, active: 1, lost: 0 });
    expect(counts.find((c) => c.source === "outro")).toBeUndefined();
  });

  it("sem data de corte inclui os mais antigos", async () => {
    const all = await repo.countsBySource(ana, null);
    const since = await repo.countsBySource(ana, windowStart);
    const visita = (rows: typeof all) => rows.find((c) => c.source === "visita")!.total;
    expect(visita(all)).toBeGreaterThanOrEqual(visita(since) + 1);
  });

  it("quem não cuida de leads recebe o relatório vazio (RLS)", async () => {
    expect(await repo.countsBySource(finance, windowStart)).toEqual([]);
    expect(await repo.list(finance, 500, { stage: "ativo" })).toEqual([]);
  });
});
