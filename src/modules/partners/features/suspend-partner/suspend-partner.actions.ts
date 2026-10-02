"use server";

import { revalidatePath } from "next/cache";
import { can, withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { reactivatePartner, suspendPartner } from "../../composition";
import type { PartnerApplication } from "../../domain/partner";
import { reactivateSchema, suspendSchema } from "./suspend-partner.use-cases";

// withCapability confere a capacidade na action; os casos de uso conferem de novo; o banco (RLS) por último.
const suspend = formAction(
  suspendSchema,
  withCapability("partners:suspend", (input, user) => suspendPartner().execute({ id: user.id, isAdmin: can(user, "partners:suspend") }, input.partnerId, input.reason)),
  { name: "partners.suspend", keepValues: ["reason"] },
);

const reactivate = formAction(
  reactivateSchema,
  withCapability("partners:suspend", (input, user) => reactivatePartner().execute({ id: user.id, isAdmin: can(user, "partners:suspend") }, input.partnerId)),
  { name: "partners.reactivate" },
);

export async function suspendAction(previous: FormState<PartnerApplication>, formData: FormData) {
  const state = await suspend(previous, formData);
  // O conteúdo do parceiro some de todo o app.
  if (state.status === "success") revalidatePath("/", "layout");
  return state;
}

export async function reactivateAction(previous: FormState<PartnerApplication>, formData: FormData) {
  const state = await reactivate(previous, formData);
  if (state.status === "success") revalidatePath("/", "layout");
  return state;
}
