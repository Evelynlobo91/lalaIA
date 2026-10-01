"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { formatShortCode } from "@/shared/kernel/short-code";
import { Button, Card, CardTitle, FormAlert, TextField } from "@/shared/ui";
import { validateRewardCodeAction } from "../rewards.actions";
import type { ValidatedReward } from "../rewards.use-case";

/** Validar no balcão o código da recompensa que o explorador mostra. Só vale para esta missão. */
export function ValidateRewardCodeForm({ missionId }: { missionId: string }) {
  const [state, dispatch, pending] = useActionState<FormState<ValidatedReward>, FormData>(validateRewardCodeAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle as="h2">Validar código da recompensa</CardTitle>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <input type="hidden" name="missionId" value={missionId} />
        <div className="sm:flex-1">
          <TextField
            label="Código do explorador"
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            maxLength={20}
            required
            className="font-mono uppercase tracking-widest"
            defaultValue={state.status === "error" ? state.values?.code : ""}
            errors={errors.code}
            key={state.status === "success" ? state.data.code : "codigo"}
          />
        </div>
        <Button type="submit" loading={pending}>
          Validar
        </Button>
      </form>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && (
        <FormAlert variant="success">
          Código {formatShortCode(state.data.code)} validado: entregue “{state.data.description}”.
        </FormAlert>
      )}
    </Card>
  );
}
