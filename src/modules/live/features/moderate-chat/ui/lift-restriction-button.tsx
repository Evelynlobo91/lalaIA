"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { liftChatRestrictionAction } from "../moderate-chat.actions";

/** Portal: retirar um silêncio ou banimento do chat (#192). */
export function LiftRestrictionButton({ restrictionId, userName, kind }: { restrictionId: string; userName: string; kind: "mute" | "ban" }) {
  const [state, action, pending] = useActionState<FormState<{ restrictionId: string }>, FormData>(liftChatRestrictionAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="restrictionId" value={restrictionId} />
      <Button type="submit" size="sm" variant="ghost" loading={pending} aria-label={`${kind === "ban" ? "Desbanir" : "Tirar o silêncio de"} ${userName}`}>
        {kind === "ban" ? "Desbanir" : "Tirar o silêncio"}
      </Button>
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível alterar."}</FormAlert>}
    </form>
  );
}
