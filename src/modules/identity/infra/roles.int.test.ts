import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "@/shared/db/as-user";
import { sql } from "@/shared/db/sql";
import { PostgresRoleRepository } from "./postgres-role-repository";

const db = sql();
const repo = new PostgresRoleRepository(db);
const partner = crypto.randomUUID();
const common = crypto.randomUUID();

beforeAll(async () => {
  for (const id of [partner, common]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`roles-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09", display_name: "Roles" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${partner}, 'partner')`;
});

afterAll(async () => {
  await db`delete from auth.users where id in (${partner}, ${common})`;
  await db.end();
});

describe("PostgresRoleRepository", () => {
  it("lista os papéis do usuário", async () => {
    expect(await repo.rolesOf(partner)).toEqual(["partner"]);
    expect(await repo.rolesOf(common)).toEqual([]);
  });

  it("lista usuários recentes com papéis (moderação)", async () => {
    const list = await repo.listRecent(200);
    expect(list.find((u) => u.id === partner)).toMatchObject({ displayName: "Roles", roles: ["partner"] });
    expect(list.find((u) => u.id === common)).toMatchObject({ roles: [] });
  });

  it("o banco recusa papel desconhecido", async () => {
    await expect(db`insert into identity.user_roles (user_id, role) values (${common}, 'superuser')`).rejects.toThrow();
  });
});

describe("authz.has_role", () => {
  it("responde pelo usuário da requisição (auth.uid)", async () => {
    const [p] = await asUser(partner, (tx) => tx`select authz.has_role('partner') as ok`, db);
    const [c] = await asUser(common, (tx) => tx`select authz.has_role('partner') as ok`, db);
    expect(p.ok).toBe(true);
    expect(c.ok).toBe(false);
  });

  it("revogar o papel vale na hora", async () => {
    await db`delete from identity.user_roles where user_id = ${partner} and role = 'partner'`;
    const [p] = await asUser(partner, (tx) => tx`select authz.has_role('partner') as ok`, db);
    expect(p.ok).toBe(false);
    expect(await repo.rolesOf(partner)).toEqual([]);
  });

  it("anon não executa a função (nem enxerga o schema authz)", async () => {
    const [row] = await db`select has_function_privilege('anon', 'authz.has_role(text)', 'execute') as exec, has_schema_privilege('anon', 'authz', 'usage') as usage`;
    expect(row).toEqual({ exec: false, usage: false });
  });
});
