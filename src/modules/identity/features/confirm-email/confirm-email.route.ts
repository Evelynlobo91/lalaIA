import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/shared/http/safe-redirect";
import { logger } from "@/shared/observability";
import { createSupabaseServerClient } from "../../infra/supabase-server-client";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "signup"];
const log = logger().child({ module: "identity", slice: "confirm-email" });

/**
 * GET /auth/confirm?token_hash=...&type=email&next=/
 * Link do e-mail de confirmação. Usa token_hash (verifyOtp) em vez de PKCE para funcionar
 * mesmo se o link for aberto em outro navegador/dispositivo. Sucesso já inicia a sessão.
 */
export async function confirmEmailRoute(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"));

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const target = new URL(next, request.url);
      target.searchParams.set("bem-vindo", "1");
      return NextResponse.redirect(target);
    }
    log.warn("confirmação de e-mail falhou", { code: error.code });
  }

  return NextResponse.redirect(new URL("/cadastro?erro=link-invalido", request.url));
}
