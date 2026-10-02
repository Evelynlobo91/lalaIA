"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { savePlan } from "../../composition";
import type { Plan } from "../../domain/plan";
import { billingActor } from "./billing-actor";
import { planSchema } from "./plans.use-cases";

// withCapability confere na action; o caso de uso confere de novo; o banco (RLS) por último.
const save = formAction(
  planSchema,
  withCapability("billing:write", (input, user) => savePlan().execute(billingActor(user), input.planId, input.data)),
  { name: "billing.savePlan", keepValues: ["planId", "code", "name", "description", "price"], arrays: ["features"] },
);

export async function savePlanAction(previous: FormState<Plan>, formData: FormData) {
  const state = await save(previous, formData);
  if (state.status === "success") {
    // Os recursos liberados mudam o que os parceiros podem fazer em todo o app.
    revalidatePath("/", "layout");
    redirect(`/admin/financeiro?salvo=${state.data.id}`);
  }
  return state;
}
