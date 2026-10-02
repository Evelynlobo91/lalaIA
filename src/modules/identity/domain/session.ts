import type { BusinessRuleError, Result } from "@/shared/kernel";

export type CurrentUser = { id: string; email: string; displayName: string; avatarUrl: string | null };

/** Porta para autenticar e encerrar sessão no provedor (Supabase Auth). */
export interface SessionGateway {
  signIn(email: string, password: string): Promise<Result<{ userId: string }, BusinessRuleError>>;
  signOut(): Promise<void>;
  /** Usuário da sessão atual, com token validado; `null` se não houver sessão. */
  currentUserId(): Promise<{ id: string; email: string } | null>;
}
