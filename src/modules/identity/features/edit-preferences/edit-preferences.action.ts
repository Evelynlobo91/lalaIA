"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/shared/db/sql";
import { formAction, type FormState } from "@/shared/http/form-action";
import type { UserPreferences } from "../../domain/preferences";
import { PostgresPreferencesRepository } from "../../infra/postgres-preferences-repository";
import { withUser } from "../session/current-user";
import { EditPreferences, editPreferencesSchema } from "./edit-preferences";

const handle = formAction(
  editPreferencesSchema,
  withUser((input, user) => new EditPreferences(new PostgresPreferencesRepository(sql())).execute(user.id, input)),
  { name: "identity.edit-preferences", arrays: ["categories"] },
);

export async function editPreferencesAction(previous: FormState<UserPreferences>, formData: FormData) {
  const state = await handle(previous, formData);
  if (state.status === "success") revalidatePath("/perfil", "layout");
  return state;
}
