import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresPrivacyAgreements } from "./postgres-privacy-agreements";

const db = sql();
const repo = new PostgresPrivacyAgreements(db);
const ana = crypto.randomUUID(); // parceira
const bia = crypto.randomUUID(); // outra parceira
const leo = crypto.randomUUID(); // usuário comum

beforeAll(async () => {
  for (const id of [ana, bia, leo]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`live-priv-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${ana}, 'partner'), (${bia}, 'partner')`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${ana}, ${bia}, ${leo})`;
  await db.end();
});

describe("PostgresPrivacyAgreements (#55)", () => {
  it("parceira registra o aceite com a data; renovar troca versão e data", async () => {
    expect(await repo.find(ana)).toBeNull();
    const first = await repo.accept(ana, "2020-01");
    expect(first).toMatchObject({ version: "2020-01" });
    expect(first!.acceptedAt).toBeInstanceOf(Date);
    const renewed = await repo.accept(ana, "2026-10");
    expect(renewed?.version).toBe("2026-10");
    expect(await repo.find(ana)).toEqual(renewed);
  });

  it("RLS: usuário comum não registra; ninguém registra nem lê o aceite de outra pessoa", async () => {
    expect(await repo.accept(leo, "2026-10")).toBeNull();
    await expect(
      asUser(bia, (tx) => tx`insert into live.broadcaster_agreements (owner_id, guidelines_version) values (${ana}, '2026-10')`, db),
    ).rejects.toThrow(/row-level security/);
    await repo.accept(ana, "2026-10");
    const seen = await asUser(bia, (tx) => tx`select owner_id from live.broadcaster_agreements where owner_id = ${ana}`, db);
    expect(seen).toHaveLength(0);
  });

  it("conta apagada leva o aceite junto (LGPD)", async () => {
    const temp = crypto.randomUUID();
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${temp}, ${`live-priv-${temp}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
    await db`insert into identity.user_roles (user_id, role) values (${temp}, 'partner')`;
    await repo.accept(temp, "2026-10");
    await db`delete from auth.users where id = ${temp}`;
    expect(await repo.find(temp)).toBeNull();
  });
});
