import postgres from "postgres";
import type { TestUser } from "./users";

// Acesso direto ao banco LOCAL de testes (para preparar cenários, ex.: conceder papéis).
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export function grantRole(user: Pick<TestUser, "email">, role: "partner" | "admin") {
  return withDb(
    (sql) => sql`insert into identity.user_roles (user_id, role)
                 select id, ${role} from auth.users where lower(email) = ${user.email.toLowerCase()}
                 on conflict do nothing`,
  );
}

/** Parceiro já aprovado (cadastro + papel), para testes do portal. */
export async function createApprovedPartner(user: Pick<TestUser, "email">, businessName = "Bar do Teste") {
  await withDb(
    (sql) => sql`insert into partners.partners (owner_id, kind, business_name, phone, description, status, reviewed_at)
                 select id, 'estabelecimento', ${businessName}, '47999990000', 'Bar de teste com música ao vivo em Joinville.', 'approved', now()
                 from auth.users where lower(email) = ${user.email.toLowerCase()}
                 on conflict (owner_id) do update set status = 'approved', business_name = excluded.business_name`,
  );
  await grantRole(user, "partner");
}
