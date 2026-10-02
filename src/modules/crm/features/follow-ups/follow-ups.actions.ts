"use server";

import { revalidatePath } from "next/cache";
import { withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { addLeadNote, completeFollowUp, setNextStep } from "../../composition";
import type { FollowUp } from "../../domain/follow-up";
import { crmActor } from "../leads/crm-actor";
import { completeSchema, nextStepSchema, noteSchema } from "./follow-ups.use-cases";

// withCapability confere na action; os casos de uso conferem de novo; o banco (RLS) por último.
const note = formAction(
  noteSchema,
  withCapability("leads:write", (input, user) => addLeadNote().execute(crmActor(user), input.leadId, input.body)),
  { name: "crm.addNote", keepValues: ["body"] },
);

const nextStep = formAction(
  nextStepSchema,
  withCapability("leads:write", (input, user) => setNextStep().execute(crmActor(user), input)),
  { name: "crm.setNextStep", keepValues: ["description", "dueOn"] },
);

const complete = formAction(
  completeSchema,
  withCapability("leads:write", (input, user) => completeFollowUp().execute(crmActor(user), input.followUpId)),
  { name: "crm.completeFollowUp" },
);

export async function addNoteAction(previous: FormState<{ leadId: string }>, formData: FormData) {
  const state = await note(previous, formData);
  if (state.status === "success") revalidatePath(`/admin/leads/${state.data.leadId}`);
  return state;
}

export async function setNextStepAction(previous: FormState<FollowUp>, formData: FormData) {
  const state = await nextStep(previous, formData);
  if (state.status === "success") revalidatePath("/admin/leads", "layout");
  return state;
}

export async function completeFollowUpAction(previous: FormState<FollowUp>, formData: FormData) {
  const state = await complete(previous, formData);
  // Sucesso ou "não encontrado" (já concluído em outra aba): a lista na tela pode estar desatualizada.
  revalidatePath("/admin/leads", "layout");
  return state;
}
