import type { SupabaseClient } from "@supabase/supabase-js";
import { BusinessRuleError, err, ok, type Result } from "@/shared/kernel";
import type { SignUpGateway, SignUpOutcome, SignUpRequest } from "../domain/auth-gateway";

// Erros esperados do Supabase Auth → mensagens para o usuário. O resto é inesperado (vai ao Sentry).
const knownErrors: Record<string, [code: string, message: string]> = {
  weak_password: ["weak_password", "Essa senha é fraca. Use pelo menos 8 caracteres, com letras e números."],
  email_address_invalid: ["invalid_email", "Informe um e-mail válido."],
  // Limite por IP: não diz nada sobre o e-mail, pode ser informado.
  over_request_rate_limit: ["rate_limited", "Muitas tentativas. Aguarde alguns minutos e tente de novo."],
  signup_disabled: ["signup_disabled", "Cadastros estão temporariamente desativados."],
};

export class SupabaseSignUpGateway implements SignUpGateway {
  constructor(private readonly client: SupabaseClient) {}

  async signUp(request: SignUpRequest): Promise<Result<SignUpOutcome, BusinessRuleError>> {
    const { data, error } = await this.client.auth.signUp({
      email: request.email,
      password: request.password,
      options: {
        emailRedirectTo: request.emailRedirectTo,
        data: { display_name: request.displayName, terms_version: request.termsVersion },
      },
    });

    if (error) {
      // Anti-enumeração: e-mail já cadastrado, ou ainda não confirmado e com reenvio bloqueado
      // pelo limite por endereço, recebem a mesma resposta de um cadastro novo.
      if (error.code === "user_already_exists" || error.code === "over_email_send_rate_limit") return ok({ kind: "undisclosed" });
      const known = error.code ? knownErrors[error.code] : undefined;
      if (known) return err(new BusinessRuleError(known[0], known[1]));
      throw error;
    }

    // Com confirmação de e-mail ativa, o Supabase devolve um usuário "fantasma" sem identidades
    // quando o e-mail já existe (proteção contra enumeração).
    if (!data.user || data.user.identities?.length === 0) return ok({ kind: "undisclosed" });

    return ok({ kind: "created", userId: data.user.id, needsEmailConfirmation: !data.session });
  }
}
