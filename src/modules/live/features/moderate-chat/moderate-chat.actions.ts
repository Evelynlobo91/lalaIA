"use server";

import { revalidatePath } from "next/cache";
import { can, withRole, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { liftChatRestriction, saveChatSettings } from "../../composition";
import { chatSettingsSchema, liftRestrictionSchema } from "./moderate-chat.use-case";

// O id vem sempre da sessão, nunca do formulário; a posse da transmissão é conferida no caso de uso e na RLS.
const moderator = (user: CurrentUser) => ({ id: user.id, canModerateAll: can(user, "content:edit") });

const save = formAction(
  chatSettingsSchema,
  withRole("partner", (input, user) => saveChatSettings().execute(moderator(user), input.streamId, { chatEnabled: input.chatEnabled, slowSeconds: input.slowSeconds })),
  { name: "live.chat-settings" },
);

const lift = formAction(
  liftRestrictionSchema,
  withRole("partner", (input, user) => liftChatRestriction().execute(moderator(user), input.restrictionId)),
  { name: "live.lift-chat-restriction" },
);

export async function saveChatSettingsAction(previous: FormState<{ streamId: string; chatEnabled: boolean; slowSeconds: number }>, formData: FormData) {
  const state = await save(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/live");
  return state;
}

export async function liftChatRestrictionAction(previous: FormState<{ restrictionId: string }>, formData: FormData) {
  const state = await lift(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/live");
  return state;
}
