"use server";

import { revalidatePath } from "next/cache";
import { withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { moveLead } from "../../composition";
import type { Lead } from "../../domain/lead";
import { crmActor } from "../leads/crm-actor";
import { moveLeadSchema } from "./pipeline.use-cases";

// withCapability confere na action; o caso de uso confere de novo; o banco (RLS) por último.
const move = formAction(
  moveLeadSchema,
  withCapability("leads:write", (input, user) => moveLead().execute(crmActor(user), input)),
  { name: "crm.moveLead", keepValues: ["to", "reason"] },
);

export async function moveLeadAction(previous: FormState<Lead>, formData: FormData) {
  const state = await move(previous, formData);
  // Sucesso ou conflito: a etapa na tela pode estar desatualizada.
  revalidatePath("/admin/leads", "layout");
  return state;
}
