"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withUser, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { provisionStream, revealStreamKey, rotateStreamKey } from "../../composition";
import type { StreamRecord } from "../../domain/stream";
import { provisionStreamSchema, streamIdSchema } from "./stream-key.schema";

// O id vem sempre da sessão (withUser), nunca do formulário (anti-IDOR).
const actor = (user: CurrentUser) => ({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });

const provision = formAction(provisionStreamSchema, withUser((input, user) => provisionStream().execute(actor(user), input)), { name: "live.provision" });

export async function provisionStreamAction(previous: FormState<StreamRecord>, formData: FormData) {
  const state = await provision(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/live");
  return state;
}

const rotate = formAction(streamIdSchema, withUser((input, user) => rotateStreamKey().execute(actor(user), input.streamId)), { name: "live.rotate-key" });

export async function rotateStreamKeyAction(previous: FormState<{ rotated: true }>, formData: FormData) {
  return rotate(previous, formData);
}

// A chave não vai no HTML da página: só chega ao navegador quando o dono pede para revelar/copiar.
const reveal = formAction(streamIdSchema, withUser((input, user) => revealStreamKey().execute(actor(user), input.streamId)), { name: "live.reveal-key" });

export async function revealStreamKeyAction(previous: FormState<{ streamKey: string }>, formData: FormData) {
  return reveal(previous, formData);
}
