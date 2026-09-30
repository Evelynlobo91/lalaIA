"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/shared/db/sql";
import { formAction, type FormState } from "@/shared/http/form-action";
import { PostgresProfileRepository } from "../../infra/postgres-profile-repository";
import { withUser } from "../session/current-user";
import { EditProfile, editProfileSchema } from "./edit-profile";

const handle = formAction(
  editProfileSchema,
  withUser((input, user) => new EditProfile(new PostgresProfileRepository(sql())).execute(user.id, input)),
  { keepValues: ["displayName"] },
);

export async function editProfileAction(previous: FormState<{ displayName: string }>, formData: FormData) {
  const state = await handle(previous, formData);
  if (state.status === "success") revalidatePath("/perfil", "layout");
  return state;
}
