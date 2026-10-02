import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Cookies de sessão do Supabase. `httpOnly`: o token nunca fica acessível ao JavaScript da página
 * (reduz o impacto de XSS). Só é possível porque toda a autenticação acontece no servidor.
 */
export const sessionCookieOptions: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
