"use server";

import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { toggleFavorite } from "../../composition";
import { favToggleSchema } from "./fav-toggle.schema";
import type { FavToggleResult } from "./fav-toggle.use-case";

const toggle = formAction(
  favToggleSchema,
  // O id do usuário vem SEMPRE da sessão (withUser), nunca do formulário.
  withUser((input, user) => toggleFavorite().execute(user.id, input)),
  { name: "favorites.toggle" },
);

/** Favorita (favorite=true) ou desfavorita (favorite=false) um lugar ou evento. */
export async function favToggleAction(previous: FormState<FavToggleResult>, formData: FormData): Promise<FormState<FavToggleResult>> {
  return toggle(previous, formData);
}
