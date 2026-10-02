import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activatePartner } from "@/modules/partners";
import { sql } from "@/shared/db/sql";
import { AcceptInvite, StartConversion } from "../features/convert-lead/convert-lead.use-cases";
import { inviteTokens } from "./invite-tokens";
import { PostgresInviteStore } from "./postgres-invite-store";
import { PostgresLeadPipeline } from "./postgres-lead-pipeline";
import { PostgresLeadRepository } from "./postgres-lead-repository";

const db = sql();
const leads = new PostgresLeadRepository(db);
const pipeline = new PostgresLeadPipeline(db);
const invites = new PostgresInviteStore(db);
const start = new StartConversion(leads, invites, inviteTokens);
const accept = new AcceptInvite(invites, inviteTokens, { activate: activatePartner });

const commercial = crypto.randomUUID();
const finance = crypto.randomUUID();
const contact = crypto.randomUUID();
const other = crypto.randomUUID();
const tag = `conv${Date.now()}`;
const actor = { id: commercial, canRead: true, canWrite: true };
const data = { kind: "estabelecimento" as const, phone: "47999990000", description: "Bar com música ao vivo no centro de Joinville.", placeId: null as string | null };
let leadId: string;
let placeId: string;

beforeAll(async () => {
  for (const [id, role] of [[commercial, "commercial"], [finance, "finance"], [contact, null], [other, null]] as const) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    if (role) await db`insert into identity.user_roles (user_id, role) values (${id}, ${role})`;
  }
  const [place] = await db<{ id: string }[]>`
    insert into places.places (source, source_id, name, category, location)
    values ('osm', ${`teste/${tag}`}, ${`Lugar ${tag}`}, 'bares', extensions.st_makepoint(-48.8456, -26.3045)::extensions.geography) returning id`;
  placeId = place.id;
  leadId = (await leads.create(commercial, { businessName: `Bar ${tag}`, contactName: "José", contactPhone: "47999990000", contactEmail: null, source: "visita", ownerId: commercial })).id;
  await pipeline.move(commercial, leadId, "lead", "proposta", null);
});

afterAll(async () => {
  await db`delete from crm.leads where business_name like ${`%${tag}%`}`;
  await db`delete from places.places where id = ${placeId}`;
  await db`delete from auth.users where id in (${commercial}, ${finance}, ${contact}, ${other})`;
  await db.end();
});

describe("conversão de lead em parceiro por convite (#150)", () => {
  let firstToken: string;
  let token: string;

  it("o comercial gera o convite; só o hash do token fica no banco", async () => {
    const result = await start.execute(actor, leadId, data);
    if (!result.ok) throw new Error("convite não gerado");
    firstToken = result.value.token;
    const [row] = await db<{ token_hash: string }[]>`select token_hash from crm.partner_invites where lead_id = ${leadId}`;
    expect(row.token_hash).toBe(inviteTokens.hash(firstToken));
    expect(row.token_hash).not.toContain(firstToken);
    expect(await invites.openFor(commercial, leadId)).not.toBeNull();
  });

  it("gerar outro convite revoga o anterior: o link antigo deixa de valer", async () => {
    const result = await start.execute(actor, leadId, { ...data, placeId });
    if (!result.ok) throw new Error("convite não gerado");
    token = result.value.token;

    const old = await accept.execute(contact, firstToken);
    expect(!old.ok && old.error.code).toBe("invite_revoked");
    const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from crm.partner_invites where lead_id = ${leadId} and accepted_at is null and revoked_at is null`;
    expect(n).toBe(1);
  });

  it("financeiro não gera nem enxerga convites (RLS)", async () => {
    await expect(invites.create(finance, leadId, "a".repeat(64), data, new Date(Date.now() + 86_400_000))).resolves.toBeNull();
    expect(await invites.openFor(finance, leadId)).toBeNull();
  });

  it("aceitar cria o parceiro aprovado com os dados do lead, concede o papel, vincula o lugar e leva o lead a ativo", async () => {
    const result = await accept.execute(contact, token);
    expect(result.ok).toBe(true);

    const [partner] = await db<{ status: string; business_name: string; phone: string; reviewed_by: string }[]>`
      select status, business_name, phone, reviewed_by from partners.partners where owner_id = ${contact}`;
    expect(partner).toEqual({ status: "approved", business_name: `Bar ${tag}`, phone: "47999990000", reviewed_by: commercial });
    const roles = await db<{ role: string }[]>`select role from identity.user_roles where user_id = ${contact}`;
    expect(roles.map((r) => r.role)).toEqual(["partner"]);
    const [claim] = await db<{ status: string }[]>`select c.status from partners.place_claims c join partners.partners p on p.id = c.partner_id where p.owner_id = ${contact} and c.place_id = ${placeId}`;
    expect(claim.status).toBe("approved");

    expect((await leads.findById(commercial, leadId))?.stage).toBe("ativo");
    const history = await pipeline.history(commercial, leadId);
    expect(history[0]).toMatchObject({ from: "proposta", to: "ativo", changedBy: commercial });
    expect(await invites.openFor(commercial, leadId)).toBeNull();
  });

  it("aceitar de novo com a mesma conta não duplica nada; outra conta não usa o mesmo link", async () => {
    expect((await accept.execute(contact, token)).ok).toBe(true);
    const [{ n }] = await db<{ n: number }[]>`select count(*)::int as n from partners.partners where owner_id = ${contact}`;
    expect(n).toBe(1);
    expect(await pipeline.history(commercial, leadId)).toHaveLength(2);

    const stranger = await accept.execute(other, token);
    expect(!stranger.ok && stranger.error.code).toBe("invite_accepted");
    const [{ m }] = await db<{ m: number }[]>`select count(*)::int as m from partners.partners where owner_id = ${other}`;
    expect(m).toBe(0);
  });

  it("lead ativo não gera novo convite", async () => {
    const again = await start.execute(actor, leadId, data);
    expect(!again.ok && again.error.code).toBe("lead_already_converted");
  });

  it("convite vencido não é aceito", async () => {
    const lead2 = (await leads.create(commercial, { businessName: `Café ${tag}`, contactName: "Ana", contactPhone: "47999990001", contactEmail: null, source: "outro", ownerId: commercial })).id;
    const result = await start.execute(actor, lead2, data);
    if (!result.ok) throw new Error("convite não gerado");
    await db`update crm.partner_invites set expires_at = now() - interval '1 minute' where lead_id = ${lead2}`;

    const expired = await accept.execute(other, result.value.token);
    expect(!expired.ok && expired.error.code).toBe("invite_expired");
    expect((await leads.findById(commercial, lead2))?.stage).toBe("lead");
  });
});
