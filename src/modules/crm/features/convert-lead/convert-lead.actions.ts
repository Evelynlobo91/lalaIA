"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withCapability, withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { acceptInvite, startConversion } from "../../composition";
import { crmActor } from "../leads/crm-actor";
import { startConversionSchema, tokenSchema } from "./convert-lead.use-cases";

// withCapability confere na action; o caso de uso confere de novo; o banco (RLS) por último.
const start = formAction(
  startConversionSchema,
  withCapability("leads:write", (input, user) => startConversion().execute(crmActor(user), input.leadId, input.data)),
  { name: "crm.startConversion", keepValues: ["kind", "phone", "description", "placeId"] },
);

export async function startConversionAction(previous: FormState<{ token: string; expiresAt: Date }>, formData: FormData) {
  const state = await start(previous, formData);
  if (state.status === "success") revalidatePath("/admin/leads", "layout");
  return state;
}

// Qualquer pessoa logada pode aceitar: a autorização é o token do convite. O id vem da sessão.
const accept = formAction(
  z.object({ token: tokenSchema }),
  withUser((input, user) => acceptInvite().execute(user.id, input.token)),
  { name: "crm.acceptInvite" },
);

export async function acceptInviteAction(previous: FormState<{ partnerId: string | null }>, formData: FormData) {
  const state = await accept(previous, formData);
  if (state.status === "success") {
    revalidatePath("/", "layout");
    redirect("/parceiro/inicio");
  }
  return state;
}
