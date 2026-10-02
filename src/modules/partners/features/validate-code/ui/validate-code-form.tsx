"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, Card, CardTitle, FormAlert, TextField } from "@/shared/ui";
import { formatOfferCode } from "../../../domain/offer-code";
import { validateCodeAction } from "../validate-code.action";
import type { ValidatedCode } from "../validate-code.use-case";

/** Validar no balcão o código que o explorador mostra. */
export function ValidateCodeForm() {
  const [state, dispatch, pending] = useActionState<FormState<ValidatedCode>, FormData>(validateCodeAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(() => dispatch(data));
  };

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Validar código</CardTitle>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="sm:flex-1">
          <TextField
            label="Código do cliente"
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
          Código {formatOfferCode(state.data.code)} validado: “{state.data.offerTitle}”. Pode aplicar o desconto.
        </FormAlert>
      )}
    </Card>
  );
}
