import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresOfferRepository } from "./postgres-offer-repository";
import { PostgresPartnerRepository } from "./postgres-partner-repository";

const db = sql();
const owner = crypto.randomUUID();
const outsider = crypto.randomUUID();
const admin = crypto.randomUUID();
const users = async (ids: string[]) => ids.map((id) => ({ id, displayName: "Pessoa", email: `${id}@lalaia.test` }));
const repo = new PostgresPartnerRepository(db, users);
const offers = new PostgresOfferRepository(db);
const placeId = crypto.randomUUID();
let partnerId: string;

const suspended = async () => (await db<{ suspended: boolean }[]>`select platform.owner_suspended(${owner}) as suspended`)[0].suspended;

beforeAll(async () => {
  for (const id of [owner, outsider, admin]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`s-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${admin}, 'admin')`;
  const [row] = await db<{ id: string }[]>`
    insert into partners.partners (owner_id, kind, business_name, phone, description, status, reviewed_at)
    values (${owner}, 'estabelecimento', 'Bar Suspenso', '47999990000', 'Bar de teste da suspensão de parceiros.', 'approved', now())
    returning id`;
  partnerId = row.id;
  await db`insert into partners.offers (partner_id, target_type, target_id, title, description, starts_at, ends_at)
           values (${partnerId}, 'place', ${placeId}, 'Chope em dobro', 'Oferta de teste da suspensão.', now() - interval '1 hour', now() + interval '1 day')`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${owner}, ${outsider}, ${admin})`;
  await db.end();
});

describe("suspensão de parceiro (#144)", () => {
  it("quem não é admin não suspende (RLS: nada é atualizado)", async () => {
    expect(await repo.suspend(outsider, partnerId, "Tentativa indevida")).toBeNull();
    expect(await repo.suspend(owner, partnerId, "Tentativa indevida")).toBeNull();
    expect(await suspended()).toBe(false);
  });

  it("admin lista os parceiros aprovados", async () => {
    expect((await repo.listActive(admin)).find((p) => p.id === partnerId)).toMatchObject({ status: "approved", suspensionReason: null });
    expect(await repo.listActive(outsider)).toHaveLength(0);
  });

  it("admin suspende com motivo: o dono entra no espelho e a oferta some", async () => {
    expect(await offers.listCurrentFor({ type: "place", id: placeId }, new Date())).toHaveLength(1);

    expect(await repo.suspend(admin, partnerId, "Denúncias de conteúdo irregular.")).toMatchObject({
      status: "suspended",
      suspensionReason: "Denúncias de conteúdo irregular.",
    });
    expect(await suspended()).toBe(true);
    expect(await offers.listCurrentFor({ type: "place", id: placeId }, new Date())).toHaveLength(0);
    expect((await repo.listActive(admin)).find((p) => p.id === partnerId)?.status).toBe("suspended");
  });

  it("suspender de novo não tem efeito, e a fila de revisão não reaprova um suspenso", async () => {
    expect(await repo.suspend(admin, partnerId, "Segunda tentativa")).toBeNull();
    expect(await repo.review(admin, partnerId, { status: "approved" })).toBeNull();
    expect(await suspended()).toBe(true);
  });

  it("o dono vê o motivo, mas não se reativa nem reenvia o cadastro", async () => {
    expect(await repo.findByOwner(owner)).toMatchObject({ status: "suspended", suspensionReason: "Denúncias de conteúdo irregular." });
    expect(await repo.reactivate(owner, partnerId)).toBeNull();
    const direct = await asUser(owner, (tx) => tx`update partners.partners set status = 'approved' where owner_id = ${owner} returning id`, db);
    expect(direct).toHaveLength(0);
    expect(await suspended()).toBe(true);
  });

  it("suspensão sem motivo é barrada pelo banco", async () => {
    await expect(db`update partners.partners set suspension_reason = null where id = ${partnerId}`).rejects.toThrow(/check/);
  });

  it("o espelho e a função ficam fora do alcance de usuários comuns", async () => {
    await expect(asUser(outsider, (tx) => tx`select * from platform.suspended_owners`, db)).rejects.toThrow(/permission denied/);
    await expect(asUser(outsider, (tx) => tx`select platform.owner_suspended(${owner})`, db)).rejects.toThrow(/permission denied/);
  });

  it("admin reativa: o dono sai do espelho e a oferta volta", async () => {
    expect(await repo.reactivate(admin, partnerId)).toMatchObject({ status: "approved", suspensionReason: null });
    expect(await suspended()).toBe(false);
    expect(await offers.listCurrentFor({ type: "place", id: placeId }, new Date())).toHaveLength(1);
    expect(await repo.reactivate(admin, partnerId)).toBeNull();
  });
});
