"use server";

import { revalidatePath } from "next/cache";
import { withRole } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { validateOfferCode } from "../../composition";
import { asOfferAuthor } from "../manage-offers/offer-author";
import { validateCodeSchema, type ValidatedCode } from "./validate-code.use-case";

const validate = formAction(
  validateCodeSchema,
  withRole("partner", (input, user) => asOfferAuthor(user, (author) => validateOfferCode().execute(author, input.code))),
  { name: "partners.validate-offer-code", keepValues: ["code"] },
);

export async function validateCodeAction(previous: FormState<ValidatedCode>, formData: FormData) {
  const state = await validate(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/ofertas");
  return state;
}
