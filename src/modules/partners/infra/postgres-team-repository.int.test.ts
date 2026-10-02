import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { generateShortCode } from "@/shared/kernel/short-code";
import { PostgresRedemptionRepository } from "./postgres-offer-repository";
import { PostgresTeamRepository } from "./postgres-team-repository";

const db = sql();
const team = new PostgresTeamRepository(db);
const redemptions = new PostgresRedemptionRepository(db);
const tag = `equipe${Date.now()}`;
const [ana, bia, caixa, cliente, semConfirmar] = Array.from({ length: 5 }, () => crypto.randomUUID());
const emailOf = (id: string) => `${tag}-${id}@lalaia.test`;
const code = generateShortCode();
let anaPartner: string;
let biaPartner: string;
let offerId: string;
let redemptionId: string;

const partner = async (owner: string, name: string) =>
  (
    await db<{ id: string }[]>`
      insert into partners.partners (owner_id, kind, business_name, phone, description, status, reviewed_at)
      values (${owner}, 'estabelecimento', ${`${name} ${tag}`}, '47999990000', 'Bar de teste da equipe do parceiro.', 'approved', now()) returning id`
  )[0].id;

beforeAll(async () => {
  for (const id of [ana, bia, caixa, cliente, semConfirmar]) {
    await db`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
             values (${id}, ${emailOf(id)}, ${id === semConfirmar ? null : new Date()}, ${db.json({ terms_version: "2026-09" })})`;
  }
  for (const id of [ana, bia]) await db`insert into identity.user_roles (user_id, role) values (${id}, 'partner')`;
  anaPartner = await partner(ana, "Bar da Ana");
  biaPartner = await partner(bia, "Bar da Bia");
  [{ id: offerId }] = await db<{ id: string }[]>`
    insert into partners.offers (partner_id, target_type, target_id, title, description, starts_at, ends_at)
    values (${anaPartner}, 'place', ${crypto.randomUUID()}, 'Chope em dobro', 'Oferta de teste da equipe.', now() - interval '1 hour', now() + interval '1 day') returning id`;
  [{ id: redemptionId }] = await db<{ id: string }[]>`insert into partners.offer_redemptions (offer_id, user_id, code) values (${offerId}, ${cliente}, ${code}) returning id`;
});

afterAll(async () => {
  await db`delete from auth.users where id in ${db([ana, bia, caixa, cliente, semConfirmar])}`;
  await db.end();
});

describe("PostgresTeamRepository (#158)", () => {
  it("antes do convite, a pessoa não é membro e não enxerga o resgate da oferta", async () => {
    expect(await team.membershipsOf(caixa)).toEqual([]);
    expect(await redemptions.findForPartner(caixa, anaPartner, code)).toBeNull();
    expect(await redemptions.markValidated(caixa, redemptionId)).toBeNull();
  });

  it("dono convida pelo e-mail; repetir o convite não duplica", async () => {
    const added = await team.add(ana, anaPartner, emailOf(caixa));
    expect(added).toMatchObject({ email: emailOf(caixa), joined: false });
    expect(await team.add(ana, anaPartner, emailOf(caixa))).toBeNull();
    await team.add(ana, anaPartner, emailOf(semConfirmar));
    await team.add(ana, anaPartner, `${tag}-sem-conta@lalaia.test`);
    expect((await team.list(ana, anaPartner)).map((m) => [m.email, m.joined])).toEqual([
      [emailOf(caixa), true],
      [emailOf(semConfirmar), false],
      [`${tag}-sem-conta@lalaia.test`, false],
    ]);
  });

  it("ninguém convida, lê ou remove na equipe de outro parceiro (RLS)", async () => {
    await expect(team.add(bia, anaPartner, emailOf(bia))).rejects.toThrow(/row-level security/);
    await expect(team.add(caixa, anaPartner, `${tag}-amigo@lalaia.test`)).rejects.toThrow(/row-level security/);
    expect(await team.list(bia, anaPartner)).toEqual([]);
    expect(await team.list(caixa, anaPartner)).toEqual([]);
    const [first] = await team.list(ana, anaPartner);
    expect(await team.remove(bia, anaPartner, first.id)).toBe(false);
    expect(await team.remove(bia, biaPartner, first.id)).toBe(false);
    expect(await team.remove(caixa, anaPartner, first.id)).toBe(false);
  });

  it("membro pertence só à equipe que o convidou; e-mail sem confirmação não dá acesso", async () => {
    expect(await team.membershipsOf(caixa)).toEqual([{ partnerId: anaPartner, businessName: `Bar da Ana ${tag}` }]);
    expect(await team.membershipsOf(semConfirmar)).toEqual([]);
    expect(await team.membershipsOf(bia)).toEqual([]);
    expect(await redemptions.findForPartner(semConfirmar, anaPartner, code)).toBeNull();
  });

  it("membro não resgata a oferta do lugar onde atende", async () => {
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: caixa, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        await tx`insert into partners.offer_redemptions (offer_id, user_id, code) values (${offerId}, ${caixa}, ${generateShortCode()})`;
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("parceiro suspenso: a equipe perde o acesso; reativado, volta", async () => {
    await db`update partners.partners set status = 'suspended', suspension_reason = 'Teste da equipe.' where id = ${anaPartner}`;
    expect(await team.membershipsOf(caixa)).toEqual([]);
    expect(await redemptions.findForPartner(caixa, anaPartner, code)).toBeNull();
    await db`update partners.partners set status = 'approved', suspension_reason = null where id = ${anaPartner}`;
    expect(await team.membershipsOf(caixa)).toHaveLength(1);
  });

  it("membro enxerga e valida o resgate da oferta do parceiro, em nome próprio", async () => {
    expect(await redemptions.findForPartner(caixa, anaPartner, code)).toMatchObject({ id: redemptionId, validatedAt: null });
    const validated = await redemptions.markValidated(caixa, redemptionId);
    expect(validated?.validatedAt).toBeInstanceOf(Date);
    const [row] = await db<{ validated_by: string }[]>`select validated_by from partners.offer_redemptions where id = ${redemptionId}`;
    expect(row.validated_by).toBe(caixa);
    expect(await redemptions.markValidated(caixa, redemptionId)).toBeNull();
  });

  it("removido perde o acesso na hora", async () => {
    const mine = (await team.list(ana, anaPartner)).find((m) => m.email === emailOf(caixa))!;
    expect(await team.remove(ana, anaPartner, mine.id)).toBe(true);
    expect(await team.remove(ana, anaPartner, mine.id)).toBe(false);
    expect(await team.membershipsOf(caixa)).toEqual([]);
    expect(await redemptions.findForPartner(caixa, anaPartner, code)).toBeNull();
  });
});
