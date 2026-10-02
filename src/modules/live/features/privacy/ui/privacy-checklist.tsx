"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, Checkbox, FormAlert } from "@/shared/ui";
import { LIVE_GUIDELINES_VERSION, PRIVACY_CHECKLIST, type PrivacyAgreement } from "../../../domain/privacy";
import { acceptLiveGuidelinesAction } from "../privacy.actions";

/** Checklist obrigatório antes da primeira live (RNF16/RNF17). Todos os itens precisam ser marcados. */
export function PrivacyChecklist() {
  const [state, action, pending] = useActionState<FormState<PrivacyAgreement>, FormData>(acceptLiveGuidelinesAction, idleFormState);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} aria-label="Diretrizes de privacidade da live" className="flex flex-col gap-3">
      <input type="hidden" name="version" value={LIVE_GUIDELINES_VERSION} />
      <p className="text-sm">Antes de gerar a chave ou ativar uma live, confirme que a transmissão segue estas regras:</p>
      {PRIVACY_CHECKLIST.map((item) => (
        <Checkbox key={item.id} name={item.id} label={item.label} errors={errors?.[item.id]} />
      ))}
      {state.status === "error" && !errors && <FormAlert>{state.message ?? "Não foi possível registrar o aceite."}</FormAlert>}
      {state.status === "error" && errors?.version && <FormAlert>{errors.version[0]}</FormAlert>}
      <Button type="submit" loading={pending} className="self-start">
        <ShieldCheck aria-hidden className="size-5" /> Aceitar as diretrizes
      </Button>
    </form>
  );
}
