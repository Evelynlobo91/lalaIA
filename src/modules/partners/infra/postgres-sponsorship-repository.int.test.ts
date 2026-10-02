import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresSponsorshipRepository } from "./postgres-sponsorship-repository";

const db = sql();
const repo = new PostgresSponsorshipRepository(db);
const ana = crypto.randomUUID();
const bia = crypto.randomUUID();
const tag = `dest${Date.now()}`;
const place = { type: "place" as const, id: crypto.randomUUID() };
const event = { type: "event" as const, id: crypto.randomUUID() };
const now = new Date();
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
let anaPartner: string;
let biaPartner: string;

const partner = async (owner: string, name: string) =>
  (
    await db<{ id: string }[]>`
      insert into partners.partners (owner_id, kind, business_name, phone, description, status, reviewed_at)
      values (${owner}, 'estabelecimento', ${`${name} ${tag}`}, '47999990000', 'Bar de teste do destaque patrocinado.', 'approved', now()) returning id`
  )[0].id;

beforeAll(async () => {
  for (const id of [ana, bia]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${tag}-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${id}, 'partner')`;
  }
  anaPartner = await partner(ana, "Bar da Ana");
  biaPartner = await partner(bia, "Bar da Bia");
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia})`;
  await db.end();
});

describe("PostgresSponsorshipRepository (#29)", () => {
  it("parceiro destaca um alvo e ele passa a constar entre os destaques de agora", async () => {
    const created = await repo.create(ana, anaPartner, place, now, inDays(7));
    expect(created).toMatchObject({ partnerId: anaPartner, target: place, status: "active" });
    expect(await repo.activeKeys(new Date())).toContain(`place:${place.id}`);
    expect((await repo.listByPartner(ana, anaPartner)).map((s) => s.id)).toEqual([created!.id]);
  });

  it("um destaque ativo por alvo: o segundo pedido (de qualquer parceiro) não entra", async () => {
    expect(await repo.create(ana, anaPartner, place, now, inDays(7))).toBeNull();
    expect(await repo.create(bia, biaPartner, place, now, inDays(7))).toBeNull();
  });

  it("ninguém destaca em nome de outro parceiro nem vê ou encerra o destaque alheio (RLS)", async () => {
    await expect(repo.create(bia, anaPartner, event, now, inDays(7))).rejects.toThrow(/row-level security/);
    expect(await repo.listByPartner(bia, anaPartner)).toHaveLength(0);
    const [mine] = await repo.listByPartner(ana, anaPartner);
    expect(await repo.end(bia, anaPartner, mine.id)).toBeNull();
    expect(await repo.end(bia, biaPartner, mine.id)).toBeNull();
    expect(await repo.activeKeys(new Date())).toContain(`place:${place.id}`);
  });

  it("fora da janela não conta: ainda não começou ou já terminou", async () => {
    await repo.create(ana, anaPartner, event, inDays(1), inDays(8));
    const keys = await repo.activeKeys(new Date());
    expect(keys).not.toContain(`event:${event.id}`);
    expect(await repo.activeKeys(inDays(2))).toContain(`event:${event.id}`);
    expect(await repo.activeKeys(inDays(9))).not.toContain(`event:${event.id}`);
  });

  it("o banco recusa período maior que 31 dias e fim antes do início", async () => {
    const other = { type: "place" as const, id: crypto.randomUUID() };
    await expect(repo.create(ana, anaPartner, other, now, inDays(40))).rejects.toThrow(/check/);
    await expect(repo.create(ana, anaPartner, other, now, inDays(-1))).rejects.toThrow(/check/);
  });

  it("parceiro suspenso sai dos destaques de agora; reativado, volta", async () => {
    await db`update partners.partners set status = 'suspended', suspension_reason = 'Teste do destaque.' where id = ${anaPartner}`;
    expect(await repo.activeKeys(new Date())).not.toContain(`place:${place.id}`);
    await db`update partners.partners set status = 'approved', suspension_reason = null where id = ${anaPartner}`;
    expect(await repo.activeKeys(new Date())).toContain(`place:${place.id}`);
  });

  it("encerrar tira do ar e libera o alvo para um novo destaque", async () => {
    const [, mine] = await repo.listByPartner(ana, anaPartner);
    expect(await repo.end(ana, anaPartner, mine.id)).toMatchObject({ status: "ended" });
    expect(await repo.end(ana, anaPartner, mine.id)).toBeNull();
    expect(await repo.activeKeys(new Date())).not.toContain(`place:${place.id}`);
    expect(await repo.create(bia, biaPartner, place, now, inDays(15))).not.toBeNull();
  });

  it("encerrar todos os destaques de uma conta (perdeu o direito no plano) não mexe nos de outra", async () => {
    await asUser(ana, (tx) => tx`select 1`, db);
    expect(await repo.endAllOf(ana)).toBe(1); // o do evento, que ainda estava ativo
    expect((await repo.listByPartner(ana, anaPartner)).every((s) => s.status === "ended")).toBe(true);
    expect(await repo.activeKeys(new Date())).toContain(`place:${place.id}`); // agora é da Bia
    expect(await repo.endAllOf(ana)).toBe(0);
  });
});
