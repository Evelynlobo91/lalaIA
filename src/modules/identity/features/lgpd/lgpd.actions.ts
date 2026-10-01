"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { domainEvents } from "@/shared/events";
import { sql } from "@/shared/db/sql";
import { formAction, type FormState } from "@/shared/http/form-action";
import { logger } from "@/shared/observability";
import { CONSENT_COOKIES, type Consents } from "../../domain/consents";
import { PostgresConsentRepository } from "../../infra/postgres-consent-repository";
import { PostgresProfileRepository } from "../../infra/postgres-profile-repository";
import { PostgresAccountDeleter } from "../../infra/lgpd-adapters";
import { SupabaseAvatarStorage } from "../../infra/supabase-avatar-storage";
import { createSupabaseServerClient } from "../../infra/supabase-server-client";
import { SupabaseSessionGateway } from "../../infra/supabase-session-gateway";
import { withUser } from "../session/current-user";
import { consentsSchema, deleteAccountSchema } from "./lgpd.schema";
import { DeleteAccount, UpdateConsents } from "./lgpd.use-case";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Espelha a escolha em cookies de preferência (lidos no navegador). Não são httpOnly de propósito: não têm segredo. */
async function mirrorToCookies(consents: Consents) {
  const jar = await cookies();
  for (const [kind, name] of Object.entries(CONSENT_COOKIES) as Array<[keyof Consents, string]>) {
    jar.set(name, consents[kind] ? "1" : "0", { path: "/", maxAge: ONE_YEAR, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
}

const handleConsents = formAction(
  consentsSchema,
  withUser((input, user) => new UpdateConsents(new PostgresConsentRepository(sql())).execute(user.id, input)),
  { name: "identity.update-consents" },
);

export async function updateConsentsAction(previous: FormState<Consents>, formData: FormData) {
  const state = await handleConsents(previous, formData);
  if (state.status === "success" && state.data) {
    await mirrorToCookies(state.data);
    revalidatePath("/perfil", "layout");
  }
  return state;
}

const handleDelete = formAction(
  deleteAccountSchema,
  withUser(async (_input, user) => {
    const client = await createSupabaseServerClient();
    return new DeleteAccount(
      domainEvents(),
      new PostgresProfileRepository(sql()),
      new SupabaseAvatarStorage(client),
      new PostgresAccountDeleter(sql()),
      new SupabaseSessionGateway(client),
      logger().child({ module: "identity", slice: "lgpd" }),
    ).execute(user.id);
  }),
  { name: "identity.delete-account" },
);

export async function deleteAccountAction(previous: FormState<{ deleted: true }>, formData: FormData) {
  const state = await handleDelete(previous, formData);
  if (state.status === "success") redirect("/?conta-excluida=1");
  return state;
}
