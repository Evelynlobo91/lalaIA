import type { BusinessRuleError, Result } from "@/shared/kernel";

export type SignUpRequest = {
  email: string;
  password: string;
  displayName: string;
  termsVersion: string;
  /** Para onde o link de confirmação do e-mail leva (rota de callback do app). */
  emailRedirectTo: string;
};

export type SignUpOutcome =
  /** Conta criada; `userId` presente quando o provedor revela (nunca para e-mail já cadastrado). */
  | { kind: "created"; userId: string; needsEmailConfirmation: boolean }
  /**
   * Pedido aceito sem revelar detalhes (ex.: e-mail já cadastrado ou confirmação pendente).
   * Tratado como sucesso para não revelar quais e-mails têm conta.
   */
  | { kind: "undisclosed" };

/** Porta para o provedor de autenticação (Supabase Auth). */
export interface SignUpGateway {
  signUp(request: SignUpRequest): Promise<Result<SignUpOutcome, BusinessRuleError>>;
}
