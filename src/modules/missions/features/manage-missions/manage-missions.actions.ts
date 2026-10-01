"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole, withUser, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { archiveMission, saveMission } from "../../composition";
import type { MissionRecord } from "../../domain/mission";
import { missionSchema } from "./mission.schema";

const author = (user: CurrentUser) => ({ id: user.id, isPartner: hasRole(user, "partner"), isAdmin: hasRole(user, "admin") });

const save = formAction(missionSchema, withUser((input, user) => saveMission().execute(author(user), input.missionId, input.draft)), {
  name: "missions.save",
  keepValues: ["missionId", "title", "description", "xp", "startsAt", "endsAt"],
});

export async function saveMissionAction(previous: FormState<MissionRecord>, formData: FormData) {
  const state = await save(previous, formData);
  if (state.status === "success") {
    revalidatePath("/parceiro/missoes");
    revalidatePath("/missoes");
    redirect(`/parceiro/missoes?salvo=${state.data.id}`);
  }
  return state;
}

const archive = formAction(
  z.object({ missionId: z.uuid() }),
  withUser((input, user) => archiveMission().execute(author(user), input.missionId)),
  { name: "missions.archive" },
);

export async function archiveMissionAction(previous: FormState<MissionRecord>, formData: FormData) {
  const state = await archive(previous, formData);
  if (state.status === "success") {
    revalidatePath("/parceiro/missoes");
    revalidatePath("/missoes");
  }
  return state;
}
