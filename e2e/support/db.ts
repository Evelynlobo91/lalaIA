import postgres from "postgres";
import type { TestUser } from "./users";

// Acesso direto ao banco LOCAL de testes (para preparar cenários, ex.: conceder papéis).
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function grantRole(user: Pick<TestUser, "email">, role: "partner" | "admin") {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    await sql`insert into identity.user_roles (user_id, role)
              select id, ${role} from auth.users where lower(email) = ${user.email.toLowerCase()}
              on conflict do nothing`;
  } finally {
    await sql.end();
  }
}
