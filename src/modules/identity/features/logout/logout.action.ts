"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../infra/supabase-server-client";
import { SupabaseSessionGateway } from "../../infra/supabase-session-gateway";

/** RF02 — Logout. POST via Server Action (protegido contra CSRF pelo Next). */
export async function logoutAction(): Promise<void> {
  await new SupabaseSessionGateway(await createSupabaseServerClient()).signOut();
  redirect("/");
}
