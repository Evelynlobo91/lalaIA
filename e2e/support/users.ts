// Cria usuários de teste já confirmados pela API admin do Supabase LOCAL.
// A chave vem do ambiente (CI) ou é resolvida uma vez em e2e/global-setup.ts; nunca fica no código.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

export type TestUser = { email: string; password: string; displayName: string };

export async function createConfirmedUser(displayName = "Pessoa E2E"): Promise<TestUser> {
  const key = process.env.E2E_SUPABASE_SECRET_KEY;
  if (!key) throw new Error("E2E_SUPABASE_SECRET_KEY ausente. Rode `npm run db:start` antes dos testes E2E.");

  const user = {
    email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@lalaia.test`,
    password: "joinville2026",
    displayName,
  };
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { display_name: displayName, terms_version: "2026-09" },
    }),
  });
  if (!res.ok) throw new Error(`Falha ao criar usuário de teste: ${res.status} ${await res.text()}`);
  return user;
}
