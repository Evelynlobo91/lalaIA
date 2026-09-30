import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser } from "./as-user";
import { sql } from "./sql";

// Verifica o MECANISMO de autorização no banco com uma tabela de exemplo "com dono",
// no mesmo formato que os módulos (eventos, lugares de parceiros) vão usar.
const db = sql();
const partnerA = crypto.randomUUID();
const partnerB = crypto.randomUUID();
const admin = crypto.randomUUID();
const commonUser = crypto.randomUUID();
const schema = `zz_rls_${Date.now()}`;

beforeAll(async () => {
  for (const id of [partnerA, partnerB, admin, commonUser]) {
    await db`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`rls-${id}@lalaia.test`}, ${db.json({ terms_version: "2026-09" })})`;
  }
  await db`insert into identity.user_roles (user_id, role) values (${partnerA}, 'partner'), (${partnerB}, 'partner'), (${admin}, 'admin')`;

  await db.unsafe(`
    create schema ${schema};
    grant usage on schema ${schema} to authenticated;
    create table ${schema}.itens (id serial primary key, owner_id uuid not null, titulo text not null);
    alter table ${schema}.itens enable row level security;
    grant select, insert, update, delete on ${schema}.itens to authenticated;
    grant usage on sequence ${schema}.itens_id_seq to authenticated;
    create policy "dono ou admin le" on ${schema}.itens for select to authenticated
      using (owner_id = (select auth.uid()) or (select authz.has_role('admin')));
    create policy "parceiro cria o proprio" on ${schema}.itens for insert to authenticated
      with check (owner_id = (select auth.uid()) and (select authz.has_role('partner')));
    create policy "dono ou admin altera" on ${schema}.itens for update to authenticated
      using (owner_id = (select auth.uid()) or (select authz.has_role('admin')));
  `);
  await db.unsafe(`insert into ${schema}.itens (owner_id, titulo) values ('${partnerA}', 'Evento A'), ('${partnerB}', 'Evento B')`);
});

afterAll(async () => {
  await db.unsafe(`drop schema if exists ${schema} cascade`);
  await db`delete from auth.users where id in (${partnerA}, ${partnerB}, ${admin}, ${commonUser})`;
  await db.end();
});

const titles = (rows: Array<{ titulo: string }>) => rows.map((r) => r.titulo).sort();

describe("asUser + RLS", () => {
  it("parceiro só vê os próprios itens, mesmo consultando sem filtro", async () => {
    const rows = await asUser(partnerA, (tx) => tx.unsafe(`select titulo from ${schema}.itens`), db);
    expect(titles(rows as never)).toEqual(["Evento A"]);
  });

  it("parceiro não altera item de outro parceiro (0 linhas afetadas)", async () => {
    const res = await asUser(partnerA, (tx) => tx.unsafe(`update ${schema}.itens set titulo = 'hackeado' where titulo = 'Evento B'`), db);
    expect(res.count).toBe(0);
    const [row] = await db.unsafe(`select titulo from ${schema}.itens where owner_id = '${partnerB}'`);
    expect(row.titulo).toBe("Evento B");
  });

  it("parceiro não cria item em nome de outro", async () => {
    await expect(asUser(partnerA, (tx) => tx.unsafe(`insert into ${schema}.itens (owner_id, titulo) values ('${partnerB}', 'forjado')`), db)).rejects.toThrow(
      /row-level security/,
    );
  });

  it("usuário comum (sem papel partner) não cria itens", async () => {
    await expect(asUser(commonUser, (tx) => tx.unsafe(`insert into ${schema}.itens (owner_id, titulo) values ('${commonUser}', 'x')`), db)).rejects.toThrow(
      /row-level security/,
    );
  });

  it("admin vê e modera itens de todos", async () => {
    const rows = await asUser(admin, (tx) => tx.unsafe(`select titulo from ${schema}.itens`), db);
    expect(titles(rows as never)).toEqual(["Evento A", "Evento B"]);
    const res = await asUser(admin, (tx) => tx.unsafe(`update ${schema}.itens set titulo = 'Evento B (moderado)' where owner_id = '${partnerB}'`), db);
    expect(res.count).toBe(1);
  });

  it("dentro do asUser não há acesso às tabelas internas de identity", async () => {
    await expect(asUser(partnerA, (tx) => tx`select * from identity.user_roles`, db)).rejects.toThrow(/permission denied/);
  });

  it("fora do asUser a conexão volta ao papel do backend (SET LOCAL não vaza)", async () => {
    await asUser(partnerA, async () => undefined, db);
    const [row] = await db`select current_user as u`;
    expect(row.u).toBe("postgres");
  });
});
