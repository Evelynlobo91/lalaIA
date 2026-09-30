import type { NextRequest } from "next/server";
import { refreshSession } from "@/modules/identity/proxy";

export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  // Tudo, menos arquivos estáticos e ícones (não precisam de sessão).
  matcher: ["/((?!_next/static|_next/image|icons/|icon.svg|apple-icon.png|manifest.webmanifest|favicon.ico).*)"],
};
