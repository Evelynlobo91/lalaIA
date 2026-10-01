"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { acceptLiveGuidelines } from "../../composition";
import type { PrivacyAgreement } from "../../domain/privacy";
import { acceptGuidelinesSchema } from "./privacy.schema";

// O id vem sempre da sessão (withUser), nunca do formulário (anti-IDOR).
const accept = formAction(
  acceptGuidelinesSchema,
  withUser((_input, user) => acceptLiveGuidelines().execute({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") })),
  { name: "live.privacy-accept" },
);

export async function acceptLiveGuidelinesAction(previous: FormState<PrivacyAgreement>, formData: FormData) {
  const state = await accept(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/live");
  return state;
}
