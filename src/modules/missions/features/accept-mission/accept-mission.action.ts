"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { acceptMission } from "../../composition";
import type { UserMission } from "../../domain/user-mission";

const accept = formAction(
  z.object({ missionId: z.uuid() }),
  // O id do usuário vem da sessão (withUser), nunca do formulário.
  withUser((input, user) => acceptMission().execute(user.id, input.missionId)),
  { name: "missions.accept" },
);

export async function acceptMissionAction(previous: FormState<UserMission>, formData: FormData) {
  const state = await accept(previous, formData);
  if (state.status === "success") {
    revalidatePath("/missoes", "layout");
    revalidatePath("/perfil");
    redirect(`/missoes/${state.data.missionId}?aceita=1`);
  }
  return state;
}
