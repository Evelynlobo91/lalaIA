"use server";

import { revalidatePath } from "next/cache";
import { can, withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { approvePartner, rejectPartner } from "../../composition";
import type { PartnerApplication } from "../../domain/partner";
import { rejectSchema, reviewSchema } from "./review.use-cases";

// withCapability confere a capacidade na action; os casos de uso conferem de novo; o banco (RLS) por último.
const approve = formAction(
  reviewSchema,
  withCapability("partners:review", (input, user) => approvePartner().execute({ id: user.id, isAdmin: can(user, "partners:review") }, input.partnerId)),
  { name: "partners.approve" },
);

const reject = formAction(
  rejectSchema,
  withCapability("partners:review", (input, user) => rejectPartner().execute({ id: user.id, isAdmin: can(user, "partners:review") }, input.partnerId, input.reason)),
  { name: "partners.reject", keepValues: ["reason"] },
);

export async function approveAction(previous: FormState<PartnerApplication>, formData: FormData) {
  const state = await approve(previous, formData);
  if (state.status === "success") revalidatePath("/admin/parceiros");
  return state;
}

export async function rejectAction(previous: FormState<PartnerApplication>, formData: FormData) {
  const state = await reject(previous, formData);
  if (state.status === "success") revalidatePath("/admin/parceiros");
  return state;
}
