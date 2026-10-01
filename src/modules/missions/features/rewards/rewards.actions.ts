"use server";

import { revalidatePath } from "next/cache";
import { hasRole, withRole, withUser, type CurrentUser } from "@/modules/identity";
import { formAction, type FormState } from "@/shared/http/form-action";
import { ok } from "@/shared/kernel";
import { claimMissionReward, saveMissionReward, validateRewardCode } from "../../composition";
import type { MissionReward } from "../../domain/reward";
import { claimRewardSchema, saveRewardSchema, validateRewardCodeSchema } from "./rewards.schema";
import type { ValidatedReward } from "./rewards.use-case";

// O id de quem age vem sempre da sessão (withUser/withRole), nunca do formulário (anti-IDOR).
const owner = (user: CurrentUser) => ({ id: user.id, isPartner: hasRole(user, "partner") });

const save = formAction(
  saveRewardSchema,
  withRole("partner", (input, user) => saveMissionReward().execute(owner(user), input.missionId, { description: input.description, stock: input.stock })),
  { name: "missions.save-reward", keepValues: ["description", "stock"] },
);

export async function saveRewardAction(previous: FormState<MissionReward>, formData: FormData) {
  const state = await save(previous, formData);
  if (state.status === "success") {
    revalidatePath(`/parceiro/missoes/${state.data.missionId}/recompensa`);
    revalidatePath(`/missoes/${state.data.missionId}`);
  }
  return state;
}

export type ClaimedReward = { code: string };

const claim = formAction(
  claimRewardSchema,
  withUser(async (input, user) => {
    const result = await claimMissionReward().execute(user.id, input.missionId);
    return result.ok ? ok({ code: result.value.claim.code }) : result;
  }),
  { name: "missions.claim-reward" },
);

export async function claimRewardAction(previous: FormState<ClaimedReward>, formData: FormData) {
  const state = await claim(previous, formData);
  if (state.status === "success") revalidatePath("/perfil");
  return state;
}

const validate = formAction(
  validateRewardCodeSchema,
  withRole("partner", (input, user) => validateRewardCode().execute(owner(user), input.missionId, input.code)),
  { name: "missions.validate-reward-code", keepValues: ["code"] },
);

export async function validateRewardCodeAction(previous: FormState<ValidatedReward>, formData: FormData) {
  const state = await validate(previous, formData);
  if (state.status === "success") revalidatePath(`/parceiro/missoes/${state.data.missionId}/recompensa`);
  return state;
}
