"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import type { FollowUp } from "../../../domain/follow-up";
import { addNoteAction, completeFollowUpAction, setNextStepAction } from "../follow-ups.actions";

/** Concluir um follow-up: sai da lista de pendências. */
export function CompleteFollowUpButton({ followUpId, label }: { followUpId: string; label: string }) {
  const [state, action, pending] = useActionState<FormState<FollowUp>, FormData>(completeFollowUpAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="followUpId" value={followUpId} />
      <Button type="submit" size="sm" variant="secondary" loading={pending} aria-label={label} className="self-start">
        <Check aria-hidden className="size-4" /> Concluir
      </Button>
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível concluir."}</FormAlert>}
    </form>
  );
}

/** Define (ou troca) o próximo passo do lead. `minDate` é hoje no calendário de Joinville. */
export function NextStepForm({ leadId, current, minDate }: { leadId: string; current: { description: string; dueOn: string } | null; minDate: string }) {
  const [state, action, pending] = useActionState<FormState<FollowUp>, FormData>(setNextStepAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-3" aria-label="Próximo passo" noValidate>
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <TextField label="O que fazer" name="description" required maxLength={200} defaultValue={values.description ?? current?.description} errors={errors.description} />
        <TextField label="Até quando" name="dueOn" type="date" required min={minDate} defaultValue={values.dueOn ?? current?.dueOn} errors={errors.dueOn} />
      </div>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">Próximo passo salvo.</FormAlert>}
      <Button type="submit" size="sm" loading={pending} className="self-start">
        {current ? "Trocar próximo passo" : "Salvar próximo passo"}
      </Button>
    </form>
  );
}

/** Nova anotação do lead. */
export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState<FormState<{ leadId: string }>, FormData>(addNoteAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-2" aria-label="Nova anotação">
      <input type="hidden" name="leadId" value={leadId} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nova anotação
        <textarea
          name="body"
          required
          minLength={2}
          maxLength={2000}
          rows={3}
          defaultValue={state.status === "error" ? state.values?.body : undefined}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-base font-normal"
        />
        {errors.body && <span className="text-sm font-normal text-danger">{errors.body[0]}</span>}
      </label>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
        Anotar
      </Button>
    </form>
  );
}
