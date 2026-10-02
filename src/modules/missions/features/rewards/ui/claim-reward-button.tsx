"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import { claimRewardAction, type ClaimedReward } from "../rewards.actions";
import { RewardCode } from "./reward-code";

/** "Resgatar recompensa": mostra o código na hora (e ele fica em "Minhas recompensas", no perfil). */
export function ClaimRewardButton({ missionId }: { missionId: string }) {
  const [state, action, pending] = useActionState<FormState<ClaimedReward>, FormData>(claimRewardAction, idleFormState);

  if (state.status === "success") {
    return <RewardCode code={state.data.code} note="Mostre este código no balcão. Ele também fica em “Minhas recompensas”, no seu perfil." />;
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="missionId" value={missionId} />
      <Button type="submit" loading={pending} className="self-start">
        Resgatar recompensa
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message ?? "Não foi possível resgatar a recompensa."}
        </p>
      )}
    </form>
  );
}
