"use server";

import { revalidatePath } from "next/cache";
import { can, withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { moderateCta } from "../../composition";
import type { CtaRecord } from "../../domain/cta";
import { moderateCtaSchema } from "./moderate-cta.use-case";

const moderate = formAction(
  moderateCtaSchema,
  withCapability("content:edit", (input, user) => moderateCta().execute({ id: user.id, canModerate: can(user, "content:edit") }, input.ctaId, input.intent)),
  { name: "live.moderate-cta" },
);

export async function moderateCtaAction(previous: FormState<CtaRecord>, formData: FormData) {
  const state = await moderate(previous, formData);
  if (state.status === "success") revalidatePath("/admin/conteudo/chamadas");
  return state;
}
