"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withUser } from "@/modules/identity";
import { sql } from "@/shared/db/sql";
import { formAction, type FormState } from "@/shared/http/form-action";
import { PostgresPlaceOwnershipRepository } from "../../infra/postgres-place-ownership-repository";
import { EditOwnedPlace, editPlaceSchema } from "./edit-place";

const handle = formAction(
  editPlaceSchema,
  withUser((input, user) => new EditOwnedPlace(new PostgresPlaceOwnershipRepository(sql())).execute({ id: user.id, isAdmin: hasRole(user, "admin") }, input)),
  { name: "places.edit", keepValues: ["name", "street", "houseNumber", "neighborhood", "phone", "website"] },
);

export async function editPlaceAction(previous: FormState<{ placeId: string }>, formData: FormData) {
  const state = await handle(previous, formData);
  if (state.status === "success") {
    revalidatePath(`/lugares/${state.data.placeId}`);
    revalidatePath("/parceiro/lugares");
  }
  return state;
}
