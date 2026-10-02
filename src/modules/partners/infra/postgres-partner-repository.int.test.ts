import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { PartnerApplicationData } from "../domain/partner";
import { PostgresPartnerRepository } from "./postgres-partner-repository";

const db = sql();
const alice = crypto.randomUUID();
const bob = crypto.randomUUID();
const admin = crypto.randomUUID();
const users = async (ids: string[]) => ids.map((id) => ({ id, displayName: "Pessoa", email: `${id}@lalaia.test` }));
const repo = new PostgresPartnerRepository(db, users);

const data: PartnerApplicationData = {
  kind: "estabelecimento",
  businessName: "Bar da Alice",
  phone: "47999990000",
  instagram: "bardaalice",
  cnpj: null,
  description: "Bar com música ao vivo no centro de Joinville.",
};

beforeAll(async () => {
  for (const id of [alice, bob, admin]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`p-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${admin}, 'admin')`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${alice}, ${bob}, ${admin})`;
  await db.end();
});

describe("PostgresPartnerRepository (com RLS)", () => {
  it("cria o cadastro como pendente e o dono o lê", async () => {
    const created = await repo.submit(alice, data);
    expect(created).toMatchObject({ ownerId: alice, status: "pending", businessName: "Bar da Alice" });
    expect((await repo.findByOwner(alice))?.id).toBe(created.id);
  });

  it("outra pessoa não enxerga o cadastro alheio", async () => {
    const leak = await asUser(bob, (tx) => tx`select id from partners.partners where owner_id = ${alice}`, db);
    expect(leak).toHaveLength(0);
  });

  it("ninguém aprova o próprio cadastro, mesmo indo direto no banco", async () => {
    await expect(asUser(alice, (tx) => tx`update partners.partners set status = 'approved' where owner_id = ${alice}`, db)).rejects.toThrow(/row-level security/);
  });

  it("ninguém cria cadastro em nome de outra pessoa", async () => {
    await expect(
      asUser(bob, (tx) => tx`insert into partners.partners (owner_id, kind, business_name, phone, description) values (${alice}, 'promotor', 'Forjado', '47999990000', ${"x".repeat(20)})`, db),
    ).rejects.toThrow(/row-level security/);
  });

  it("usuário comum não revisa; admin lista a fila e recusa com motivo", async () => {
    const { id } = (await repo.findByOwner(alice))!;
    expect(await repo.review(bob, id, { status: "approved" })).toBeNull(); // RLS: não vê a linha → nada atualizado

    const queue = await repo.listForReview(admin, "pending");
    expect(queue.find((q) => q.id === id)).toMatchObject({ ownerEmail: `${alice}@lalaia.test` });

    const rejected = await repo.review(admin, id, { status: "rejected", reason: "Faltou o Instagram correto." });
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "Faltou o Instagram correto." });
  });

  it("recusa sem motivo é barrada pelo banco", async () => {
    await expect(asUser(admin, (tx) => tx`update partners.partners set status = 'rejected', rejection_reason = null where owner_id = ${alice}`, db)).rejects.toThrow(
      /check/,
    );
  });

  it("reenviar após recusa volta para pendente e limpa o motivo", async () => {
    const resent = await repo.submit(alice, { ...data, instagram: "bar.da.alice" });
    expect(resent).toMatchObject({ status: "pending", rejectionReason: null, instagram: "bar.da.alice" });
  });

  it("admin aprova", async () => {
    const { id } = (await repo.findByOwner(alice))!;
    expect(await repo.review(admin, id, { status: "approved" })).toMatchObject({ status: "approved" });
  });
});
