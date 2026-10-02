"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { submitApplication } from "../../composition";
import type { PartnerApplication } from "../../domain/partner";
import { applySchema } from "./apply.schema";

const handle = formAction(applySchema, withUser((input, user) => submitApplication().execute(user.id, input)), {
  name: "partners.apply",
  keepValues: ["kind", "businessName", "phone", "instagram", "cnpj", "description"],
});

export async function applyAction(previous: FormState<PartnerApplication>, formData: FormData) {
  const state = await handle(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro");
  return state;
}
