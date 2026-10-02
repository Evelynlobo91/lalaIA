"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { qrStepValidation } from "../../composition";
import type { StepCompleted } from "./complete-step.use-case";
import { completeStepSchema } from "./qr-validation.schema";

const complete = formAction(
  completeStepSchema,
  // O id do usuário vem da sessão (withUser), nunca do formulário.
  withUser((input, user) => qrStepValidation().execute(user.id, input.token, input.fix)),
  { name: "missions.complete-step" },
);

export async function completeStepAction(previous: FormState<StepCompleted>, formData: FormData) {
  const state = await complete(previous, formData);
  if (state.status === "success") {
    revalidatePath("/missoes", "layout");
    revalidatePath("/perfil");
    redirect(`/missoes/${state.data.missionId}?etapa=${state.data.stepId}`);
  }
  return state;
}
