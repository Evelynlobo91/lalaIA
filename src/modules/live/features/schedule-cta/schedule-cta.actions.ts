"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasRole, withRole, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { deleteCta, saveCta } from "../../composition";
import type { CtaRecord } from "../../domain/cta";
import { ctaIdSchema, ctaSchema } from "./schedule-cta.schema";

// O id vem sempre da sessão, nunca do formulário (anti-IDOR); a posse da transmissão é conferida no caso de uso.
const actor = (user: CurrentUser) => ({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });

const save = formAction(
  ctaSchema,
  withRole("partner", (input, user) => saveCta().execute(actor(user), input.streamId, input.ctaId, input.draft)),
  {
    name: "live.save-cta",
    keepValues: ["type", "refId", "url", "title", "body", "buttonLabel", "priority", "scheduleKind", "startsAt", "endsAt", "offsetMinutes", "durationMinutes", "intervalMinutes"],
  },
);

export async function saveCtaAction(previous: FormState<CtaRecord>, formData: FormData) {
  const state = await save(previous, formData);
  if (state.status === "success") {
    revalidatePath(`/parceiro/live/chamadas/${state.data.streamId}`);
    redirect(`/parceiro/live/chamadas/${state.data.streamId}?salvo=${state.data.id}`);
  }
  return state;
}

const remove = formAction(
  ctaIdSchema,
  withRole("partner", (input, user) => deleteCta().execute(actor(user), input.ctaId)),
  { name: "live.delete-cta" },
);

export async function deleteCtaAction(previous: FormState<{ ctaId: string }>, formData: FormData) {
  const state = await remove(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/live/chamadas", "layout");
  return state;
}
