import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/shared/db/sql";
import { IdentityPersonalData, PostgresAccountDeleter } from "./lgpd-adapters";
import { PostgresConsentRepository } from "./postgres-consent-repository";

const db = sql();
const userId = crypto.randomUUID();
const email = `lgpd-${userId}@lalaia.test`;

beforeAll(async () => {
  await db`insert into auth.users (id, email, raw_user_meta_data) values (${userId}, ${email}, ${db.json({ terms_version: "2026-09", display_name: "Titular" })})`;
  await db`insert into identity.preferences (user_id, categories, radius_km) values (${userId}, ${["shows"]}, 5)`;
});

afterAll(async () => {
  await db`delete from auth.users where id = ${userId}`;
  await db.end();
});

describe("LGPD no banco", () => {
  it("consentimentos: salva, revoga e lê de volta", async () => {
    const repo = new PostgresConsentRepository(db);
    expect(await repo.find(userId)).toBeNull();
    await repo.save(userId, { analytics: false, geolocation: true });
    await repo.save(userId, { analytics: false, geolocation: false });
    expect(await repo.find(userId)).toMatchObject({ analytics: false, geolocation: false, updatedAt: expect.any(Date) });
  });

  it("exportação do identity traz cadastro, perfil, preferências, consentimentos e termos", async () => {
    const data = (await new IdentityPersonalData(db).export({ id: userId })) as Record<string, unknown>;
    expect(data.cadastro).toMatchObject({ email });
    expect(data.perfil).toMatchObject({ display_name: "Titular" });
    expect(data.preferencias).toMatchObject({ categories: ["shows"], radius_km: 5 });
    expect(data.consentimentos).toMatchObject({ analytics: false, geolocation: false });
    expect(data.termosAceitos).toHaveLength(1);
  });

  it("excluir a conta apaga em cascata os dados do identity", async () => {
    await new PostgresAccountDeleter(db).delete(userId);
    const [left] = await db<{ n: number }[]>`
      select (select count(*) from auth.users where id = ${userId})
           + (select count(*) from identity.profiles where user_id = ${userId})
           + (select count(*) from identity.preferences where user_id = ${userId})
           + (select count(*) from identity.consents where user_id = ${userId})
           + (select count(*) from identity.terms_acceptances where user_id = ${userId}) as n`;
    expect(Number(left!.n)).toBe(0);
  });
});
