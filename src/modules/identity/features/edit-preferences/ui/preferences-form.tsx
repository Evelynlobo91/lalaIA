"use client";

import { useActionState } from "react";
import { categories } from "@/shared/catalog/categories";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, cn } from "@/shared/ui";
import { budgetOptions, groupSizes, radiusOptions, type UserPreferences } from "../../../domain/preferences";
import { editPreferencesAction } from "../edit-preferences.action";

const chip = cn(
  "inline-flex min-h-11 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-medium",
  "has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-brand-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
);

export function PreferencesForm({ preferences }: { preferences: UserPreferences }) {
  const [state, action, pending] = useActionState<FormState<UserPreferences>, FormData>(editPreferencesAction, idleFormState);
  const current = state.status === "success" ? state.data : preferences;

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {state.status === "error" && <FormAlert>{state.message ?? "Revise as opções marcadas."}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">Preferências salvas. Suas recomendações vão levar isso em conta.</FormAlert>}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Do que você gosta?</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.id} className={chip}>
              <input type="checkbox" name="categories" value={c.id} defaultChecked={current.categories.includes(c.id)} className="sr-only" />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Quanto costuma gastar por saída?
          <select name="budgetMax" defaultValue={current.budgetMax === null ? "" : String(current.budgetMax)} className="h-12 rounded-xl border border-border bg-bg px-3 text-base">
            <option value="">Sem limite definido</option>
            {budgetOptions.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Até que distância você topa ir?
          <select name="radiusKm" defaultValue={String(current.radiusKm)} className="h-12 rounded-xl border border-border bg-bg px-3 text-base">
            {radiusOptions.map((r) => (
              <option key={r} value={r}>
                Até {r} km
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Com quem você costuma sair?</legend>
        <div className="flex flex-wrap gap-2">
          <label className={chip}>
            <input type="radio" name="groupSize" value="" defaultChecked={current.groupSize === null} className="sr-only" />
            Depende
          </label>
          {groupSizes.map((g) => (
            <label key={g.id} className={chip}>
              <input type="radio" name="groupSize" value={g.id} defaultChecked={current.groupSize === g.id} className="sr-only" />
              {g.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" loading={pending} className="self-start">
        Salvar preferências
      </Button>
    </form>
  );
}
