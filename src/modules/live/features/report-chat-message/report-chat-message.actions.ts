"use server";

import { revalidatePath } from "next/cache";
import { can, withCapability } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { resolveChatReports } from "../../composition";
import { resolveReportSchema } from "./report-chat-message.use-case";

const resolve = formAction(
  resolveReportSchema,
  withCapability("content:edit", (input, user) => resolveChatReports().execute({ id: user.id, canModerate: can(user, "content:edit") }, input.messageId, input.intent)),
  { name: "live.resolve-chat-report" },
);

export async function resolveChatReportAction(previous: FormState<{ messageId: string; resolved: number }>, formData: FormData) {
  const state = await resolve(previous, formData);
  if (state.status === "success") revalidatePath("/admin/conteudo/denuncias");
  return state;
}
