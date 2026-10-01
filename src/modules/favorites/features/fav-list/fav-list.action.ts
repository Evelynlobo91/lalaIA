"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { toggleFavorite } from "../../composition";
import type { FavToggleResult } from "../fav-toggle/fav-toggle.use-case";
import { removeFavoriteSchema } from "./fav-list.schema";

const remove = formAction(
  removeFavoriteSchema,
  // Mesmo caso de uso do botão de favoritar, sempre com o estado "não favorito" (idempotente).
  withUser((input, user) => toggleFavorite().execute(user.id, { ...input, favorite: false })),
  { name: "favorites.remove" },
);

/** Remove um item da lista "Meus favoritos". */
export async function removeFavoriteAction(previous: FormState<FavToggleResult>, formData: FormData): Promise<FormState<FavToggleResult>> {
  const state = await remove(previous, formData);
  if (state.status === "success") revalidatePath("/perfil/favoritos");
  return state;
}
