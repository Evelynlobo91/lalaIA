"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasRole, withRole } from "@/modules/identity";
import { sql } from "@/shared/db/sql";
import { formAction, type FormState } from "@/shared/http/form-action";
import { PostgresPlaceOwnershipRepository } from "../../infra/postgres-place-ownership-repository";
import { CreatePlaceByAdmin, createPlaceSchema } from "./create-place";

// withRole confere o papel na action; o caso de uso confere de novo; o banco (RLS) por último.
const handle = formAction(
  createPlaceSchema,
  withRole("admin", (input, user) => new CreatePlaceByAdmin(new PostgresPlaceOwnershipRepository(sql())).execute({ id: user.id, isAdmin: hasRole(user, "admin") }, input)),
  { name: "places.createByAdmin", keepValues: ["name", "category", "street", "houseNumber", "neighborhood", "phone", "website", "lat", "lon"] },
);

export async function createPlaceAction(previous: FormState<{ placeId: string }>, formData: FormData) {
  const state = await handle(previous, formData);
  if (state.status === "success") {
    revalidatePath("/lugares");
    revalidatePath("/api/places/geo");
    // Segue para a edição: é lá que o admin informa o horário de funcionamento.
    redirect(`/admin/conteudo/lugares/${state.data.placeId}/editar?criado=1`);
  }
  return state;
}
