import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sql } from "@/shared/db/sql";
import type { CurrentUser, ProfileReader, SessionGateway } from "../../domain/session";
import { PostgresProfileReader } from "../../infra/postgres-profile-reader";
import { createSupabaseServerClient } from "../../infra/supabase-server-client";
import { SupabaseSessionGateway } from "../../infra/supabase-session-gateway";

/** Resolve o usuário da sessão a partir das portas (testável sem Next/Supabase). */
export async function resolveCurrentUser(sessions: SessionGateway, profiles: ProfileReader): Promise<CurrentUser | null> {
  const session = await sessions.currentUserId();
  if (!session) return null;
  const displayName = (await profiles.displayNameOf(session.id)) ?? session.email.split("@")[0];
  return { id: session.id, email: session.email, displayName };
}

/** Usuário logado ou `null`. Memoizado por requisição (várias chamadas, uma consulta). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const sessions = new SupabaseSessionGateway(await createSupabaseServerClient());
  return resolveCurrentUser(sessions, new PostgresProfileReader(sql()));
});

/** Protege páginas: sem sessão, leva para o login e volta para `returnTo` depois. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(returnTo)}`);
  return user;
}
