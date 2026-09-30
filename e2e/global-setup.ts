import { execSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";

/**
 * Roda uma vez antes de todos os testes (o servidor web já está de pé):
 * 1. Resolve a chave admin do Supabase LOCAL e a repassa aos workers pelo ambiente
 *    (evita N chamadas paralelas ao `supabase status`). No CI ela já vem em E2E_SUPABASE_SECRET_KEY.
 * 2. Aquece o servidor: a primeira visita a cada rota carrega o código dela; com vários
 *    navegadores em paralelo no servidor frio, os primeiros logins passavam do tempo limite.
 */
export default async function globalSetup(config: FullConfig) {
  if (!process.env.E2E_SUPABASE_SECRET_KEY) {
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

  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  for (const path of ["/", "/entrar", "/cadastro", "/perfil", "/perfil/editar", "/mapa"]) {
    await fetch(new URL(path, baseURL), { redirect: "manual" }).catch(() => undefined);
  }
}
