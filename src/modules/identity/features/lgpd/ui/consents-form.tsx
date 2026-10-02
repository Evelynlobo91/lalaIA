"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, Checkbox, FormAlert } from "@/shared/ui";
import type { Consents } from "../../../domain/consents";
import { updateConsentsAction } from "../lgpd.actions";

/** Consentimentos granulares: marcar = consente; desmarcar e salvar = revoga na hora. */
export function ConsentsForm({ consents }: { consents: Consents }) {
  const [state, action, pending] = useActionState<FormState<Consents>, FormData>(updateConsentsAction, idleFormState);
  const current = state.status === "success" ? state.data : consents;

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível salvar. Tente de novo."}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">Escolhas salvas.</FormAlert>}
      <Checkbox
        name="analytics"
        defaultChecked={current.analytics}
        label={
          <span>
            <strong>Métricas de uso.</strong> Contar suas visitas e cliques (sem identificar você) nos números que os
            parceiros veem.
          </span>
        }
      />
      <Checkbox
        name="geolocation"
        defaultChecked={current.geolocation}
        label={
          <span>
            <strong>Localização.</strong> Mostrar o botão &ldquo;Perto de mim&rdquo;. O navegador ainda pede permissão a
            cada uso, e a sua localização nunca é gravada.
          </span>
        }
      />
      <Button type="submit" loading={pending} className="self-start">
        Salvar escolhas
      </Button>
    </form>
  );
}
