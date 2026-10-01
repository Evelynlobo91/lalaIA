"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withUser, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { controlStream } from "../../composition";
import type { StreamRecord } from "../../domain/stream";
import { streamControlSchema } from "./stream-control.schema";

const actor = (user: CurrentUser) => ({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });

const control = formAction(streamControlSchema, withUser((input, user) => controlStream().execute(actor(user), input.streamId, input.action)), {
  name: "live.control",
});

export async function controlStreamAction(previous: FormState<StreamRecord>, formData: FormData) {
  const state = await control(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/live");
  return state;
}
