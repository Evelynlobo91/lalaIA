"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withRole } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { approvePartner, rejectPartner } from "../../composition";
import type { PartnerApplication } from "../../domain/partner";
import { rejectSchema, reviewSchema } from "./review.use-cases";

// withRole confere o papel na action; os casos de uso conferem de novo; o banco (RLS) por último.
const approve = formAction(
  reviewSchema,
  withRole("admin", (input, user) => approvePartner().execute({ id: user.id, isAdmin: hasRole(user, "admin") }, input.partnerId)),
  { name: "partners.approve" },
);

const reject = formAction(
  rejectSchema,
  withRole("admin", (input, user) => rejectPartner().execute({ id: user.id, isAdmin: hasRole(user, "admin") }, input.partnerId, input.reason)),
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
