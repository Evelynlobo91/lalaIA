"use client";

import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import type { MissionRecord } from "../../../domain/mission";
import { archiveMissionAction } from "../manage-missions.actions";

/** Encerrar pede confirmação (é irreversível). */
export function ArchiveMissionButton({ missionId, title }: { missionId: string; title: string }) {
  const [state, action, pending] = useActionState<FormState<MissionRecord>, FormData>(archiveMissionAction, idleFormState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Encerrar ${title}`}>
        Encerrar
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="missionId" value={missionId} />
      <span className="text-sm">Encerrar esta missão? Quem aceitou não poderá mais concluí-la.</span>
      <Button type="submit" size="sm" variant="danger" loading={pending}>
        Sim, encerrar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Voltar
      </Button>
      {state.status === "error" && <span className="text-sm text-danger">{state.message}</span>}
    </form>
  );
}
