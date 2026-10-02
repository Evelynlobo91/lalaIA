"use server";

import { revalidatePath } from "next/cache";
import { withRole } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { inviteTeamMember, removeTeamMember } from "../../composition";
import { asOfferAuthor } from "../manage-offers/offer-author";
import { inviteMemberSchema, memberIdSchema } from "./team-members.schema";
import type { TeamMember } from "./team-members.use-case";

// Só o dono (parceiro aprovado, vindo da sessão) mexe na equipe; o membro não tem o papel de parceiro.
const invite = formAction(
  inviteMemberSchema,
  withRole("partner", (input, user) => asOfferAuthor(user, ({ userId, partnerId }) => inviteTeamMember().execute({ userId, partnerId, email: user.email }, input.email))),
  { name: "partners.invite-team-member", keepValues: ["email"] },
);

const remove = formAction(
  memberIdSchema,
  withRole("partner", (input, user) => asOfferAuthor(user, ({ userId, partnerId }) => removeTeamMember().execute({ userId, partnerId, email: user.email }, input.memberId))),
  { name: "partners.remove-team-member" },
);

export async function inviteTeamMemberAction(previous: FormState<TeamMember>, formData: FormData) {
  const state = await invite(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/equipe");
  return state;
}

export async function removeTeamMemberAction(previous: FormState<{ memberId: string }>, formData: FormData) {
  const state = await remove(previous, formData);
  if (state.status === "success") revalidatePath("/parceiro/equipe");
  return state;
}
