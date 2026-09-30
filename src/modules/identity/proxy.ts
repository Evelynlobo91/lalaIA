// Entrada enxuta do módulo para o src/proxy.ts (roda antes de toda requisição).
// Separada do index.ts para não carregar componentes nem o banco no proxy.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/shared/config/public-env";
import { sessionCookieOptions } from "./infra/session-cookies";

/**
 * Renova o token de sessão quando está perto de expirar e repassa os cookies atualizados
 * para a renderização (request) e para o navegador (response).
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Respostas que gravam cookie de sessão não podem ser cacheadas por CDN.
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // getClaims valida o JWT (não confie em getSession no servidor) e dispara a renovação se preciso.
  await supabase.auth.getClaims();
  return response;
}
