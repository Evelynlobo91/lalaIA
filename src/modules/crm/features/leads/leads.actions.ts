"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { saveLead } from "../../composition";
import type { Lead } from "../../domain/lead";
import { crmActor } from "./crm-actor";
import { leadSchema } from "./leads.schema";

// withCapability confere na action; o caso de uso confere de novo; o banco (RLS) por último.
const save = formAction(
  leadSchema,
  withCapability("leads:write", (input, user) => saveLead().execute(crmActor(user), input.leadId, input.data)),
  { name: "crm.saveLead", keepValues: ["leadId", "businessName", "contactName", "contactPhone", "contactEmail", "source", "ownerId"] },
);

export async function saveLeadAction(previous: FormState<Lead>, formData: FormData) {
  const state = await save(previous, formData);
  if (state.status === "success") {
    revalidatePath("/admin/leads");
    redirect(`/admin/leads?salvo=${state.data.id}`);
  }
  return state;
}
