"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { validateCodeAtCounter } from "../../composition";
import { validateCodeSchema, type ValidatedCode } from "./validate-code.use-case";

const validate = formAction(
  validateCodeSchema,
  // Dono ou membro da equipe (#158): quem atende em qual balcão sai da sessão, nunca do formulário.
  withUser((input, user) => validateCodeAtCounter().execute(user.id, input.code)),
  { name: "partners.validate-offer-code", keepValues: ["code"] },
);

export async function validateCodeAction(previous: FormState<ValidatedCode>, formData: FormData) {
  const state = await validate(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/ofertas");
  // O balcão do membro (/parceiro/balcao) não mostra contadores: nada a revalidar lá.
  return state;
}
