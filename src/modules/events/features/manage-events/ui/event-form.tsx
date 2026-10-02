"use client";

import { useActionState, type ReactNode } from "react";
import { categories } from "@/shared/catalog/categories";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import type { EventRecord } from "../../../domain/event";
import { saveEventAction } from "../manage-events.actions";

export type EventFormValues = { eventId?: string; title: string; description: string; category: string; startsAt: string; endsAt: string; price: string };

/**
 * Formulário de evento. `placeField` é o seletor de lugar montado pela página (vem do módulo places):
 * assim este módulo não depende de componentes de outro módulo no navegador.
 */
export function EventForm({ initial, placeField, submitLabel }: { initial?: EventFormValues; placeField: ReactNode; submitLabel: string }) {
  const [state, action, pending] = useActionState<FormState<EventRecord>, FormData>(saveEventAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values: Partial<EventFormValues> = state.status === "error" ? (state.values ?? {}) : (initial ?? {});

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {values.eventId && <input type="hidden" name="eventId" value={values.eventId} />}
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <TextField label="Título" name="title" maxLength={120} required defaultValue={values.title} errors={errors.title} />

      <div className="flex flex-col gap-1.5">
        {placeField}
        {errors.placeId && <p className="text-sm text-danger">{errors.placeId[0]}</p>}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Categoria
        <select name="category" defaultValue={values.category ?? ""} className="h-12 rounded-xl border border-border bg-surface px-3 text-base">
          <option value="" disabled>
            Escolha
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {errors.category && <span className="text-sm font-normal text-danger">{errors.category[0]}</span>}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Começa em" name="startsAt" type="datetime-local" required defaultValue={values.startsAt} errors={errors.startsAt} />
        <TextField label="Termina em" name="endsAt" type="datetime-local" required defaultValue={values.endsAt} errors={errors.endsAt} />
      </div>
      <p className="-mt-3 text-sm text-muted">Horário de Joinville.</p>

      <TextField label="Valor (a partir de, em R$)" name="price" inputMode="decimal" placeholder="Deixe vazio se for gratuito" defaultValue={values.price} errors={errors.price} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Descrição
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          defaultValue={values.description}
          aria-invalid={errors.description ? true : undefined}
          className="rounded-xl border border-border bg-surface px-4 py-3 text-base font-normal aria-invalid:border-danger"
        />
        {errors.description && <span className="text-sm font-normal text-danger">{errors.description[0]}</span>}
      </label>

      <Button type="submit" size="lg" loading={pending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
