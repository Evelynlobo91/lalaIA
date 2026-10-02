"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole, withUser, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { cancelEvent, saveEvent } from "../../composition";
import type { EventRecord } from "../../domain/event";
import { eventSchema } from "./event.schema";

const organizer = (user: CurrentUser) => ({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });

const save = formAction(eventSchema, withUser((input, user) => saveEvent().execute(organizer(user), input.eventId, input.draft)), {
  name: "events.save",
  keepValues: ["eventId", "placeId", "title", "description", "category", "startsAt", "endsAt", "price"],
});

export async function saveEventAction(previous: FormState<EventRecord>, formData: FormData) {
  const state = await save(previous, formData);
  if (state.status === "success") {
    revalidatePath("/parceiro/eventos");
    // Edição vinda do backoffice volta para o backoffice (valor fixo: nunca um caminho vindo do formulário).
    if (formData.get("returnTo") === "admin") redirect(`/admin/conteudo?tipo=eventos&salvo=${state.data.id}`);
    redirect(`/parceiro/eventos?salvo=${state.data.id}`);
  }
  return state;
}

const cancel = formAction(
  z.object({ eventId: z.uuid() }),
  withUser((input, user) => cancelEvent().execute(organizer(user), input.eventId)),
  { name: "events.cancel" },
);

export async function cancelEventAction(previous: FormState<EventRecord>, formData: FormData) {
  const state = await cancel(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/eventos");
  return state;
}
