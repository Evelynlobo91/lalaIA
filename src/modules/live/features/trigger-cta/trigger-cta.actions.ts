"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withRole, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { stopCtaTrigger, triggerCta } from "../../composition";
import type { CtaRecord } from "../../domain/cta";
import { stopCtaSchema, triggerCtaSchema } from "./trigger-cta.use-case";

// O id vem sempre da sessão, nunca do formulário (anti-IDOR); a posse é conferida no caso de uso e na RLS.
const actor = (user: CurrentUser) => ({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });

const trigger = formAction(
  triggerCtaSchema,
  withRole("partner", (input, user) => triggerCta().execute(actor(user), input.ctaId, input.minutes)),
  { name: "live.trigger-cta" },
);

const stop = formAction(
  stopCtaSchema,
  withRole("partner", (input, user) => stopCtaTrigger().execute(actor(user), input.ctaId)),
  { name: "live.stop-cta" },
);

export async function triggerCtaAction(previous: FormState<CtaRecord>, formData: FormData) {
  const state = await (formData.get("intent") === "stop" ? stop : trigger)(previous, formData);
  if (state.status === "success") revalidatePath(`/parceiro/live/chamadas/${state.data.streamId}`);
  return state;
}
