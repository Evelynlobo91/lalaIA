import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { PostgresLeadActivity } from "./postgres-lead-activity";
import { PostgresLeadRepository } from "./postgres-lead-repository";

const db = sql();
const leads = new PostgresLeadRepository(db);
const activity = new PostgresLeadActivity(db);
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const finance = crypto.randomUUID();
const tag = `ativ${Date.now()}`;
const today = "2031-05-10"; // "hoje" fixo, no futuro, isolado de outros dados
let anaLead: string;
let biaLead: string;

const newLead = (ownerId: string, name: string) =>
  leads.create(ana, { businessName: `${name} ${tag}`, contactName: "José", contactPhone: "47999990000", contactEmail: null, source: "visita", ownerId });

beforeAll(async () => {
  for (const [id, role] of [[ana, "commercial"], [bia, "commercial"], [finance, "finance"]] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  anaLead = (await newLead(ana, "Bar")).id;
  biaLead = (await newLead(bia, "Café")).id;
});

afterAll(async () => {
  await db`delete from crm.leads where business_name like ${`%${tag}%`}`;
  await db`delete from auth.users where id in (${ana}, ${bia}, ${finance})`;
  await db.end();
});

describe("PostgresLeadActivity (#149)", () => {
  it("anotações: grava com o autor e lista da mais recente para a mais antiga", async () => {
    expect(await activity.addNote(ana, anaLead, "Primeiro contato por telefone.")).toBe(true);
    expect(await activity.addNote(bia, anaLead, "Pediu proposta.")).toBe(true);
    const notes = await activity.notes(ana, anaLead);
    expect(notes.map((n) => n.body)).toEqual(["Pediu proposta.", "Primeiro contato por telefone."]);
    expect(notes.map((n) => n.authorId)).toEqual([bia, ana]);
  });

  it("anotação em lead inexistente não grava", async () => {
    expect(await activity.addNote(ana, crypto.randomUUID(), "Perdida.")).toBe(false);
  });

  it("próximo passo: um em aberto por lead; definir de novo troca o que estava", async () => {
    const first = await activity.setNextStep(ana, anaLead, "Ligar para o José", "2031-05-08");
    const second = await activity.setNextStep(ana, anaLead, "Enviar proposta", today);
    expect(second).toMatchObject({ id: first!.id, description: "Enviar proposta", dueOn: today, doneAt: null });
    expect(await activity.openFollowUp(ana, anaLead)).toMatchObject({ description: "Enviar proposta" });
    const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from crm.lead_follow_ups where lead_id = ${anaLead}`;
    expect(n).toBe(1);
    expect(await activity.setNextStep(ana, crypto.randomUUID(), "Sem lead", today)).toBeNull();
  });

  it("meus follow-ups: só os dos meus leads, de hoje e atrasados, os mais antigos primeiro", async () => {
    const late = (await newLead(ana, "Atrasado")).id;
    const future = (await newLead(ana, "Futuro")).id;
    await activity.setNextStep(ana, late, "Retornar ligação", "2031-05-01");
    await activity.setNextStep(ana, future, "Visitar", "2031-05-20");
    await activity.setNextStep(bia, biaLead, "Follow-up da Bia", today);

    const mine = await activity.dueFor(ana, ana, today);
    expect(mine.map((f) => f.description)).toEqual(["Retornar ligação", "Enviar proposta"]);
    expect(mine[0]).toMatchObject({ dueOn: "2031-05-01", businessName: `Atrasado ${tag}`, contactName: "José" });
    expect((await activity.dueFor(bia, bia, today)).map((f) => f.description)).toEqual(["Follow-up da Bia"]);
  });

  it("concluir tira da lista; concluir de novo não tem efeito; depois dá para definir outro", async () => {
    const open = (await activity.openFollowUp(ana, anaLead))!;
    expect((await activity.complete(ana, open.id))?.doneAt).toBeInstanceOf(Date);
    expect(await activity.complete(ana, open.id)).toBeNull();
    expect(await activity.openFollowUp(ana, anaLead)).toBeNull();
    expect((await activity.dueFor(ana, ana, today)).map((f) => f.description)).toEqual(["Retornar ligação"]);

    const next = await activity.setNextStep(ana, anaLead, "Fechar contrato", today);
    expect(next!.id).not.toBe(open.id);
  });

  it("quem não cuida de leads não anota, não define passo, não conclui e não vê nada (RLS)", async () => {
    expect(await activity.addNote(finance, anaLead, "Intruso.")).toBe(false);
    expect(await activity.setNextStep(finance, anaLead, "Intruso", today)).toBeNull();
    expect(await activity.notes(finance, anaLead)).toHaveLength(0);
    expect(await activity.dueFor(finance, ana, today)).toHaveLength(0);
    const open = (await activity.openFollowUp(ana, anaLead))!;
    expect(await activity.complete(finance, open.id)).toBeNull();
    expect((await activity.openFollowUp(ana, anaLead))?.doneAt).toBeNull();
  });
});
