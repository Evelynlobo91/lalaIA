import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Cookies de sessão do Supabase. `httpOnly`: o token nunca fica acessível ao JavaScript da página
 * (reduz o impacto de XSS). Só é possível porque toda a autenticação acontece no servidor.
 */
export const sessionCookieOptions: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: secureCookies(),
};

/**
 * `Secure` quando o site é servido por https (produção e previews). Decidir pelo protocolo, e não por
 * NODE_ENV, evita perder a sessão num build de produção servido em http://localhost (E2E): o Safari/WebKit
 * descarta cookies `Secure` em http, mesmo no localhost.
 */
export function secureCookies(siteUrl = process.env.NEXT_PUBLIC_SITE_URL): boolean {
  return siteUrl ? siteUrl.startsWith("https://") : process.env.NODE_ENV === "production";
}
