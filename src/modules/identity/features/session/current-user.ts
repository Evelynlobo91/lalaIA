import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { publicEnv } from "@/shared/config/public-env";
import { sql } from "@/shared/db/sql";
import { UnauthorizedError, err, type DomainError, type Result } from "@/shared/kernel";
import type { ProfileRepository } from "../../domain/profile";
import type { CurrentUser, SessionGateway } from "../../domain/session";
import { PostgresProfileRepository } from "../../infra/postgres-profile-repository";
import { avatarPublicUrl } from "../../infra/supabase-avatar-storage";
import { createSupabaseServerClient } from "../../infra/supabase-server-client";
import { SupabaseSessionGateway } from "../../infra/supabase-session-gateway";

/** Resolve o usuário da sessão a partir das portas (testável sem Next/Supabase). */
export async function resolveCurrentUser(
  sessions: SessionGateway,
  profiles: Pick<ProfileRepository, "find">,
  avatarUrl: (path: string) => string,
): Promise<CurrentUser | null> {
  const session = await sessions.currentUserId();
  if (!session) return null;
  const profile = await profiles.find(session.id);
  return {
    id: session.id,
    email: session.email,
    displayName: profile?.displayName ?? session.email.split("@")[0],
    avatarUrl: profile?.avatarPath ? avatarUrl(profile.avatarPath) : null,
  };
}

/** Usuário logado ou `null`. Memoizado por requisição (várias chamadas, uma consulta). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const sessions = new SupabaseSessionGateway(await createSupabaseServerClient());
  const supabaseUrl = publicEnv().NEXT_PUBLIC_SUPABASE_URL;
  return resolveCurrentUser(sessions, new PostgresProfileRepository(sql()), (path) => avatarPublicUrl(supabaseUrl, path));
});

/** Protege páginas: sem sessão, leva para o login e volta para `returnTo` depois. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/**
 * Protege Server Actions: o id do usuário vem SEMPRE da sessão validada, nunca do formulário
 * (evita que alguém altere dados de outra pessoa trocando um id na requisição, o chamado IDOR).
 */
export function withUser<I, T>(handler: (input: I, user: CurrentUser) => Promise<Result<T, DomainError>>) {
  return async (input: I): Promise<Result<T, DomainError>> => {
    const user = await getCurrentUser();
    if (!user) return err(new UnauthorizedError("Sua sessão expirou. Entre novamente."));
    return handler(input, user);
  };
}
