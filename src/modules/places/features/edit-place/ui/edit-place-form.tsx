"use client";

import { useActionState, useState } from "react";
import { categories } from "@/shared/catalog/categories";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import type { EditablePlace } from "../../../domain/place-ownership";
import type { WeeklySchedule } from "../../../domain/weekly-schedule";
import { editPlaceAction } from "../edit-place.action";

const DAY_LABELS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function EditPlaceForm({ place, schedule, simplified }: { place: EditablePlace; schedule: WeeklySchedule; simplified: boolean }) {
  const [state, action, pending] = useActionState<FormState<{ placeId: string }>, FormData>(editPlaceAction, idleFormState);
  const [days, setDays] = useState(schedule);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  const copyMondayToWeekdays = () => setDays((d) => d.map((day, i) => (i >= 1 && i <= 4 ? { ...d[0] } : day)));

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="placeId" value={place.id} />
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">Dados atualizados. A página do lugar já mostra as mudanças.</FormAlert>}

      <TextField label="Nome" name="name" required maxLength={200} defaultValue={values.name ?? place.name} errors={errors.name} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Categoria
        <select name="category" defaultValue={place.category} className="h-12 rounded-xl border border-border bg-bg px-3 text-base">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <TextField label="Rua" name="street" maxLength={200} defaultValue={values.street ?? place.address.street ?? ""} errors={errors.street} />
        <TextField label="Número" name="houseNumber" maxLength={20} defaultValue={values.houseNumber ?? place.address.houseNumber ?? ""} errors={errors.houseNumber} />
      </div>
      <TextField label="Bairro" name="neighborhood" maxLength={120} defaultValue={values.neighborhood ?? place.address.neighborhood ?? ""} errors={errors.neighborhood} />
      <TextField label="Telefone" name="phone" type="tel" maxLength={60} defaultValue={values.phone ?? place.phone ?? ""} errors={errors.phone} />
      <TextField label="Site" name="website" type="url" placeholder="https://" defaultValue={values.website ?? place.website ?? ""} errors={errors.website} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Horário de funcionamento</legend>
        {simplified && <p className="text-sm text-muted">O horário anterior tinha intervalos que o editor não mostra; ao salvar, fica um horário por dia.</p>}
        <ul className="flex flex-col gap-2">
          {days.map((day, i) => (
            <li key={DAY_LABELS[i]} className="flex flex-wrap items-center gap-3">
              <label className="flex w-28 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`day${i}_open`}
                  checked={day.open}
                  onChange={(e) => setDays((d) => d.map((x, j) => (j === i ? { ...x, open: e.target.checked } : x)))}
                  className="size-5 accent-[var(--brand)]"
                />
                {DAY_LABELS[i]}
              </label>
              <input
                type="time"
                name={`day${i}_from`}
                value={day.from}
                aria-label={`${DAY_LABELS[i]}: abre`}
                disabled={!day.open}
                onChange={(e) => setDays((d) => d.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                className="h-11 rounded-xl border border-border bg-bg px-2 disabled:opacity-40"
              />
              <span aria-hidden>–</span>
              <input
                type="time"
                name={`day${i}_to`}
                value={day.to}
                aria-label={`${DAY_LABELS[i]}: fecha`}
                disabled={!day.open}
                onChange={(e) => setDays((d) => d.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                className="h-11 rounded-xl border border-border bg-bg px-2 disabled:opacity-40"
              />
              {/* Campos desabilitados não são enviados: mantém o valor para o servidor. */}
              {!day.open && (
                <>
                  <input type="hidden" name={`day${i}_from`} value={day.from} />
                  <input type="hidden" name={`day${i}_to`} value={day.to} />
                </>
              )}
              {!day.open && <span className="text-sm text-muted">Fechado</span>}
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={copyMondayToWeekdays}>
          Copiar segunda para terça a sexta
        </Button>
      </fieldset>

      <Button type="submit" size="lg" loading={pending} className="self-start">
        Salvar alterações
      </Button>
    </form>
  );
}
