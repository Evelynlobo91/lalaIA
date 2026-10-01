import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import type { EventDraft } from "../domain/event";
import { PostgresEventRepository } from "./postgres-event-repository";

const db = sql();
const repo = new PostgresEventRepository(db);
const parceiro = crypto.randomUUID();
const outroParceiro = crypto.randomUUID();
const comum = crypto.randomUUID();
const admin = crypto.randomUUID();

const draft = (patch: Partial<EventDraft> = {}): EventDraft => ({
  placeId: crypto.randomUUID(),
  title: "Feira Gastronômica",
  description: "Comidas típicas e música ao vivo.",
  category: "feiras",
  startsAt: new Date("2030-10-10T23:00:00Z"),
  endsAt: new Date("2030-10-11T03:00:00Z"),
  priceCents: 0,
  ...patch,
});

beforeAll(async () => {
  for (const id of [parceiro, outroParceiro, comum, admin]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`ev-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${parceiro}, 'partner'), (${outroParceiro}, 'partner'), (${admin}, 'admin')`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${parceiro}, ${outroParceiro}, ${comum}, ${admin})`;
  await db.end();
});

describe("PostgresEventRepository (com RLS)", () => {
  it("parceiro cria, edita e cancela o próprio evento", async () => {
    const created = await repo.create(parceiro, draft());
    expect(created).toMatchObject({ ownerId: parceiro, status: "scheduled", title: "Feira Gastronômica" });

    const updated = await repo.update(parceiro, created.id, draft({ title: "Feira Gastronômica de Primavera", priceCents: 1500 }));
    expect(updated).toMatchObject({ title: "Feira Gastronômica de Primavera", priceCents: 1500 });

    expect(await repo.cancel(parceiro, created.id)).toMatchObject({ status: "cancelled" });
    // Cancelado não é mais editável nem "cancelável" de novo.
    expect(await repo.update(parceiro, created.id, draft())).toBeNull();
  });

  it("usuário comum não cria evento (só parceiro)", async () => {
    await expect(repo.create(comum, draft())).rejects.toThrow(/row-level security/);
  });

  it("outro parceiro não edita nem cancela; admin modera", async () => {
    const created = await repo.create(parceiro, draft());
    expect(await repo.update(outroParceiro, created.id, draft({ title: "Hackeado" }))).toBeNull();
    expect(await repo.cancel(outroParceiro, created.id)).toBeNull();
    expect(await repo.cancel(admin, created.id)).toMatchObject({ status: "cancelled" });
  });

  it("dono não transfere o evento para outra pessoa", async () => {
    const created = await repo.create(parceiro, draft());
    await expect(asUser(parceiro, (tx) => tx`update events.events set owner_id = ${outroParceiro} where id = ${created.id}`, db)).rejects.toThrow(/permission denied/);
  });

  it("o banco recusa término antes do início e duração acima de 14 dias", async () => {
    await expect(repo.create(parceiro, draft({ endsAt: new Date("2030-10-10T22:00:00Z") }))).rejects.toThrow(/check/);
    await expect(repo.create(parceiro, draft({ endsAt: new Date("2030-11-10T22:00:00Z") }))).rejects.toThrow(/check/);
  });

  it("lista por dono, do mais recente para o mais antigo", async () => {
    const mine = await repo.listByOwner(parceiro);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.ownerId === parceiro)).toBe(true);
  });
});
