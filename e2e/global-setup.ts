import { execSync } from "node:child_process";

/**
 * Roda uma vez antes de todos os testes. Resolve a chave admin do Supabase LOCAL e a repassa
 * aos workers pelo ambiente (evita N chamadas paralelas ao `supabase status`, que são lentas).
 * Nenhuma chave fica no código: no CI ela já vem em E2E_SUPABASE_SECRET_KEY.
 */
export default function globalSetup() {
  if (process.env.E2E_SUPABASE_SECRET_KEY) return;
  try {
    const line = execSync("npx supabase status -o env", { encoding: "utf8" })
      .split("\n")
      .find((l) => l.startsWith("SECRET_KEY="));
    const key = line?.replace(/^SECRET_KEY="?/, "").replace(/"?\s*$/, "");
    if (key) process.env.E2E_SUPABASE_SECRET_KEY = key;
  } catch {
    // Sem Supabase local: os testes que criam usuário vão falhar com mensagem clara.
  }
}
