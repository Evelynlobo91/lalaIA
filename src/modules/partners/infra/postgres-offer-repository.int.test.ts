import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { createSql, sql } from "@/shared/db/sql";
import { InMemoryEventBus } from "@/shared/events";
import { generateOfferCode } from "../domain/offer-code";
import type { Offer, OfferDraft } from "../domain/offer";
import { RedeemOffer } from "../features/redeem-offer/redeem-offer.use-case";
import { PostgresOfferRepository, PostgresRedemptionRepository } from "./postgres-offer-repository";

const db = sql();
const offers = new PostgresOfferRepository(db);
const redemptions = new PostgresRedemptionRepository(db);
const dono = crypto.randomUUID();
const outro = crypto.randomUUID();
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const multidao = Array.from({ length: 12 }, () => crypto.randomUUID());
const users = [dono, outro, ana, bia, ...multidao];
let partnerDono: string;
let partnerOutro: string;

const draft = (patch: Partial<OfferDraft> = {}): OfferDraft => ({
  target: { type: "place", id: crypto.randomUUID() },
  title: "10% no café",
  description: "Desconto em qualquer café da casa.",
  startsAt: new Date(Date.now() - 86_400_000),
  endsAt: new Date(Date.now() + 7 * 86_400_000),
  maxRedemptions: null,
  ...patch,
});

beforeAll(async () => {
  for (const id of users) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`of-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${dono}, 'partner'), (${outro}, 'partner')`;
  [{ id: partnerDono }] = await db`insert into partners.partners (owner_id, kind, business_name, phone, description, status) values (${dono}, 'estabelecimento', 'Café do Dono', '47999990000', ${"x".repeat(20)}, 'approved') returning id`;
  [{ id: partnerOutro }] = await db`insert into partners.partners (owner_id, kind, business_name, phone, description, status) values (${outro}, 'estabelecimento', 'Café do Outro', '47999990001', ${"x".repeat(20)}, 'approved') returning id`;
});

afterAll(async () => {
  await db`delete from auth.users where id = any(${users}::uuid[])`;
  await db.end();
});

describe("ofertas (com RLS)", () => {
  it("parceiro cria e edita a própria; não cria em nome de outro parceiro nem mexe no contador", async () => {
    const offer = await offers.create(dono, partnerDono, draft());
    expect(offer).toMatchObject({ partnerId: partnerDono, status: "active", redeemedCount: 0 });

    const edited = await offers.update(dono, offer.id, draft({ title: "15% no café", target: offer.target }));
    expect(edited?.title).toBe("15% no café");

    await expect(offers.create(outro, partnerDono, draft())).rejects.toThrow(/row-level security/);
    expect(await offers.update(outro, offer.id, draft({ title: "Invadido" }))).toBeNull();
    await expect(asUser(dono, (tx) => tx`update partners.offers set redeemed_count = 99 where id = ${offer.id}`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(dono, (tx) => tx`update partners.offers set partner_id = ${partnerOutro} where id = ${offer.id}`, db)).rejects.toThrow(/permission denied/);
  });

  it("depois do primeiro resgate, a oferta só pode ser encerrada (trigger) e encerrar é definitivo", async () => {
    const offer = await offers.create(dono, partnerDono, draft());
    await redemptions.redeem(ana, offer.id, generateOfferCode());
    await expect(offers.update(dono, offer.id, draft({ target: offer.target, title: "Mudou" }))).rejects.toThrow(/só pode ser encerrada/);

    const ended = await offers.end(dono, offer.id);
    expect(ended?.status).toBe("ended");
    await expect(asUser(dono, (tx) => tx`update partners.offers set status = 'active', ended_at = null where id = ${offer.id}`, db)).rejects.toThrow(/não volta a valer/);
  });
});

describe("resgates (com RLS)", () => {
  let offer: Offer;

  beforeAll(async () => {
    offer = await offers.create(dono, partnerDono, draft({ maxRedemptions: 5 }));
  });

  it("resgate é idempotente por pessoa e conta uma vez", async () => {
    const first = await redemptions.redeem(ana, offer.id, generateOfferCode());
    const again = await redemptions.redeem(ana, offer.id, generateOfferCode());
    expect(first.kind === "redeemed" && first.created).toBe(true);
    expect(again.kind === "redeemed" && !again.created && first.kind === "redeemed" && again.redemption.code === first.redemption.code).toBe(true);
    expect((await offers.findById(offer.id))?.redeemedCount).toBe(1);
    expect(await redemptions.findMine(ana, offer.id)).not.toBeNull();
  });

  it("ninguém resgata em nome de outra pessoa, já validado, nem a própria oferta; e só vê os próprios resgates", async () => {
    await expect(asUser(bia, (tx) => tx`insert into partners.offer_redemptions (offer_id, user_id, code) values (${offer.id}, ${ana}, ${generateOfferCode()})`, db)).rejects.toThrow(
      /row-level security/,
    );
    await expect(
      asUser(bia, (tx) => tx`insert into partners.offer_redemptions (offer_id, user_id, code, validated_at) values (${offer.id}, ${bia}, ${generateOfferCode()}, now())`, db),
    ).rejects.toThrow(/permission denied/);
    expect(await redemptions.redeem(dono, offer.id, generateOfferCode())).toEqual({ kind: "unavailable" });
    expect(await asUser(bia, (tx) => tx`select id from partners.offer_redemptions where user_id = ${ana}`, db)).toHaveLength(0);
  });

  it("oferta fora da validade ou encerrada não é resgatada (RLS)", async () => {
    const future = await offers.create(dono, partnerDono, draft({ startsAt: new Date(Date.now() + 86_400_000) }));
    expect(await redemptions.redeem(bia, future.id, generateOfferCode())).toEqual({ kind: "unavailable" });
    const ended = await offers.create(dono, partnerDono, draft());
    await offers.end(dono, ended.id);
    expect(await redemptions.redeem(bia, ended.id, generateOfferCode())).toEqual({ kind: "unavailable" });
  });

  it("código repetido é detectado (o caso de uso sorteia outro)", async () => {
    const other = await offers.create(dono, partnerDono, draft());
    const mine = await redemptions.findMine(ana, offer.id);
    expect(await redemptions.redeem(bia, other.id, mine!.code)).toEqual({ kind: "code_taken" });
  });

  it("validação: só o dono da oferta encontra o código, vale uma vez e grava quem validou", async () => {
    const mine = (await redemptions.findMine(ana, offer.id))!;

    // Outro parceiro: o código "não existe" (RLS), nem filtrando pelo parceiro dono.
    expect(await redemptions.findForPartner(outro, partnerOutro, mine.code)).toBeNull();
    expect(await redemptions.findForPartner(outro, partnerDono, mine.code)).toBeNull();
    expect(await redemptions.markValidated(outro, mine.id)).toBeNull();
    // O explorador não valida o próprio código.
    expect(await redemptions.markValidated(ana, mine.id)).toBeNull();

    const found = await redemptions.findForPartner(dono, partnerDono, mine.code);
    expect(found).toMatchObject({ id: mine.id, offer: { id: offer.id } });
    const validated = await redemptions.markValidated(dono, mine.id);
    expect(validated?.validatedAt).toBeInstanceOf(Date);
    expect(await redemptions.markValidated(dono, mine.id)).toBeNull();

    const [row] = await db`select validated_by from partners.offer_redemptions where id = ${mine.id}`;
    expect(row.validated_by).toBe(dono);
    const listed = await offers.listByPartner(partnerDono);
    expect(listed.find((o) => o.id === offer.id)?.validatedCount).toBe(1);
  });

  it("o parceiro não altera outras colunas do resgate nem valida em nome de outra pessoa", async () => {
    const r = await redemptions.redeem(bia, offer.id, generateOfferCode());
    const id = r.kind === "redeemed" ? r.redemption.id : "";
    await expect(asUser(dono, (tx) => tx`update partners.offer_redemptions set code = 'ZZZZZZZZ' where id = ${id}`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(dono, (tx) => tx`update partners.offer_redemptions set validated_at = now(), validated_by = ${outro} where id = ${id}`, db)).rejects.toThrow(
      /row-level security/,
    );
  });

  it("meus resgates trazem a oferta", async () => {
    const list = await redemptions.listMine(ana);
    expect(list.map((r) => r.offer.id)).toContain(offer.id);
  });
});

describe("limite total sob concorrência", () => {
  it("12 pessoas resgatando ao mesmo tempo uma oferta com limite 5: exatamente 5 conseguem", async () => {
    const limited = await offers.create(dono, partnerDono, draft({ maxRedemptions: 5 }));
    // Conexões separadas para as transações correrem de fato em paralelo.
    const pool = createSql(process.env.DATABASE_URL!);
    try {
      const parallel = new PostgresRedemptionRepository(pool);
      const outcomes = await Promise.all(multidao.map((u) => parallel.redeem(u, limited.id, generateOfferCode())));
      expect(outcomes.filter((o) => o.kind === "redeemed")).toHaveLength(5);
      expect(outcomes.filter((o) => o.kind === "sold_out")).toHaveLength(7);
    } finally {
      await pool.end();
    }
    const [{ count }] = await db`select count(*)::int as count from partners.offer_redemptions where offer_id = ${limited.id}`;
    expect(count).toBe(5);
    expect((await offers.findById(limited.id))?.redeemedCount).toBe(5);
  });

  it("a mesma pessoa tocando várias vezes ao mesmo tempo: um resgate só, contado uma vez", async () => {
    const offer = await offers.create(dono, partnerDono, draft({ maxRedemptions: 3 }));
    const pool = createSql(process.env.DATABASE_URL!);
    try {
      const parallel = new PostgresRedemptionRepository(pool);
      const outcomes = await Promise.all(Array.from({ length: 5 }, () => parallel.redeem(bia, offer.id, generateOfferCode())));
      const codes = new Set(outcomes.map((o) => (o.kind === "redeemed" ? o.redemption.code : o.kind)));
      expect(codes.size).toBe(1);
    } finally {
      await pool.end();
    }
    expect((await offers.findById(offer.id))?.redeemedCount).toBe(1);
  });

  it("caso de uso ponta a ponta publica o evento só para quem resgatou de fato", async () => {
    const offer = await offers.create(dono, partnerDono, draft({ maxRedemptions: 1 }));
    const bus = new InMemoryEventBus();
    const published: string[] = [];
    bus.subscribe("partners.OfferRedeemed", (e) => void published.push(e.payload.userId));
    const redeem = new RedeemOffer(offers, redemptions, async () => null, bus);
    expect((await redeem.execute(ana, offer.id)).ok).toBe(true);
    const late = await redeem.execute(bia, offer.id);
    expect(!late.ok && late.error.code).toBe("offer_sold_out");
    await new Promise((r) => setTimeout(r, 10));
    expect(published).toEqual([ana]);
  });
});

describe("LGPD", () => {
  it("excluir a conta apaga os resgates da pessoa em cascata", async () => {
    const offer = await offers.create(dono, partnerDono, draft());
    const temp = crypto.randomUUID();
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${temp}, ${`of-${temp}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await redemptions.redeem(temp, offer.id, generateOfferCode());
    await db`delete from auth.users where id = ${temp}`;
    const [{ count }] = await db`select count(*)::int as count from partners.offer_redemptions where user_id = ${temp}`;
    expect(count).toBe(0);
  });
});
