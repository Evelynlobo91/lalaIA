"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withUser, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { updateStreamNote } from "../../composition";
import type { StreamRecord } from "../../domain/stream";
import { streamNoteSchema } from "./stream-context.schema";

// O id vem sempre da sessão (withUser), nunca do formulário (anti-IDOR).
const actor = (user: CurrentUser) => ({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });

const update = formAction(streamNoteSchema, withUser((input, user) => updateStreamNote().execute(actor(user), input.streamId, input.note)), { name: "live.note" });

export async function updateStreamNoteAction(previous: FormState<StreamRecord>, formData: FormData) {
  const state = await update(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/live");
  return state;
}
