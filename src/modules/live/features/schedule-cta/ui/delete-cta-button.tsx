"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { deleteCtaAction } from "../schedule-cta.actions";

/** Remover uma chamada da transmissão. */
export function DeleteCtaButton({ ctaId, title }: { ctaId: string; title: string }) {
  const [state, action, pending] = useActionState<FormState<{ ctaId: string }>, FormData>(deleteCtaAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ctaId" value={ctaId} />
      <Button type="submit" size="sm" variant="ghost" loading={pending} aria-label={`Remover a chamada ${title}`}>
        Remover
      </Button>
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível remover."}</FormAlert>}
    </form>
  );
}
