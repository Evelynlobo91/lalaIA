"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import type { UserMission } from "../../../domain/user-mission";
import { acceptMissionAction } from "../accept-mission.action";

export function AcceptMissionButton({ missionId, title }: { missionId: string; title: string }) {
  const [state, action, pending] = useActionState<FormState<UserMission>, FormData>(acceptMissionAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="missionId" value={missionId} />
      <Button type="submit" loading={pending} aria-label={`Aceitar ${title}`} className="self-start">
        Aceitar missão
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message ?? "Não foi possível aceitar a missão."}
        </p>
      )}
    </form>
  );
}
