import type { SupabaseClient } from "@supabase/supabase-js";
import { BusinessRuleError, err, ok, type Result } from "@/shared/kernel";
import type { SessionGateway } from "../domain/session";

// Mensagem única para credencial errada: não revela se o e-mail tem conta.
const INVALID = new BusinessRuleError("invalid_credentials", "E-mail ou senha incorretos.");

const knownErrors: Record<string, BusinessRuleError> = {
  invalid_credentials: INVALID,
  // O Supabase só responde isso depois de conferir a senha: quem vê já provou ser o dono.
  email_not_confirmed: new BusinessRuleError("email_not_confirmed", "Confirme seu e-mail antes de entrar. Procure o link que enviamos."),
  over_request_rate_limit: new BusinessRuleError("rate_limited", "Muitas tentativas. Aguarde alguns minutos e tente de novo."),
  user_banned: INVALID,
};

export class SupabaseSessionGateway implements SessionGateway {
  constructor(private readonly client: SupabaseClient) {}

  async signIn(email: string, password: string): Promise<Result<{ userId: string }, BusinessRuleError>> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      const known = error.code ? knownErrors[error.code] : undefined;
      if (known) return err(known);
      throw error;
    }
    return ok({ userId: data.user.id });
  }

  async signOut(): Promise<void> {
    // scope "local": encerra esta sessão (este dispositivo) e apaga os cookies.
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  async currentUserId(): Promise<{ id: string; email: string } | null> {
    const { data, error } = await this.client.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return { id: data.claims.sub, email: String(data.claims.email ?? "") };
  }
}
