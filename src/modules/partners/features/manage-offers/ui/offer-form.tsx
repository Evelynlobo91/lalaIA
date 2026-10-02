"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { MAX_OFFER_REDEMPTIONS, type Offer } from "../../../domain/offer";
import { saveOfferAction } from "../manage-offers.actions";
import type { OfferFormValues } from "../partner-offers";

export type OfferTargetOption = { value: string; label: string; type: "place" | "event" };

const fieldClass = "rounded-xl border border-border bg-surface px-4 text-base font-normal aria-invalid:border-danger";

/**
 * Formulário de oferta. `targetOptions`: lugares que o parceiro gerencia e eventos que criou.
 * Envio manual (sem `action` no <form>): o React não limpa os campos depois de um erro de validação.
 */
export function OfferForm({ initial, targetOptions, submitLabel }: { initial?: OfferFormValues; targetOptions: OfferTargetOption[]; submitLabel: string }) {
  const [state, dispatch, pending] = useActionState<FormState<Offer>, FormData>(saveOfferAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values: Partial<OfferFormValues> = state.status === "error" ? (state.values ?? {}) : (initial ?? {});
  const places = targetOptions.filter((o) => o.type === "place");
  const events = targetOptions.filter((o) => o.type === "event");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {values.offerId && <input type="hidden" name="offerId" value={values.offerId} />}
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Onde vale
        <select
          name="target"
          required
          defaultValue={values.target ?? (targetOptions.length === 1 ? targetOptions[0].value : "")}
          aria-invalid={errors.target ? true : undefined}
          className={`h-12 ${fieldClass} px-3`}
        >
          <option value="" disabled>
            Escolha o lugar ou evento
          </option>
          {places.length > 0 && (
            <optgroup label="Meus lugares">
              {places.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {events.length > 0 && (
            <optgroup label="Meus eventos">
              {events.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {errors.target && <span className="text-sm font-normal text-danger">{errors.target[0]}</span>}
      </label>

      <TextField label="Título" name="title" maxLength={80} required placeholder="Ex.: 10% de desconto no café" defaultValue={values.title} errors={errors.title} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Descrição e regras
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={500}
          rows={4}
          defaultValue={values.description}
          aria-invalid={errors.description ? true : undefined}
          className={`${fieldClass} py-3`}
        />
        {errors.description && <span className="text-sm font-normal text-danger">{errors.description[0]}</span>}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Começa em" name="startsAt" type="datetime-local" required defaultValue={values.startsAt} errors={errors.startsAt} />
        <TextField label="Termina em" name="endsAt" type="datetime-local" required defaultValue={values.endsAt} errors={errors.endsAt} />
      </div>
      <p className="-mt-3 text-sm text-muted">Horário de Joinville.</p>

      <TextField
        label="Limite total de resgates (opcional)"
        name="maxRedemptions"
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_OFFER_REDEMPTIONS}
        step={1}
        defaultValue={values.maxRedemptions}
        errors={errors.maxRedemptions}
        hint="Deixe em branco para não ter limite. Cada pessoa resgata uma vez só."
      />

      <Button type="submit" loading={pending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
