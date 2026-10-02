"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import type { CtaRecord } from "../../../domain/cta";
import { moderateCtaAction } from "../moderate-cta.actions";

/** Backoffice: desativar ou reativar uma chamada (#182). */
export function ModerateCtaButton({ ctaId, title, disabled }: { ctaId: string; title: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState<CtaRecord>, FormData>(moderateCtaAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ctaId" value={ctaId} />
      <Button type="submit" name="intent" value={disabled ? "enable" : "disable"} size="sm" variant={disabled ? "secondary" : "danger"} loading={pending} aria-label={`${disabled ? "Reativar" : "Desativar"} a chamada ${title}`}>
        {disabled ? "Reativar" : "Desativar"}
      </Button>
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível alterar a chamada."}</FormAlert>}
    </form>
  );
}
