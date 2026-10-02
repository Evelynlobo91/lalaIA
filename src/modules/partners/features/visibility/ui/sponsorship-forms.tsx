"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { endSponsorshipAction, startSponsorshipAction } from "../visibility.actions";
import { sponsorshipDays, type Sponsorship } from "../visibility.use-cases";

const selectClass = "h-12 rounded-xl border border-border bg-surface px-3 text-base font-normal";

/** Contratar um destaque (#29): o que destacar (lugar ou evento do parceiro) e por quantos dias. */
export function StartSponsorshipForm({ targets }: { targets: Array<{ value: string; label: string }> }) {
  const [state, action, pending] = useActionState<FormState<Sponsorship>, FormData>(startSponsorshipAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-4" aria-label="Novo destaque" noValidate>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
      {state.status === "success" && <FormAlert variant="success">Destaque no ar. Ele aparece como “Patrocinado” nas sugestões.</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          O que destacar
          {/* `key`: depois de um erro o React restaura os campos; o select só reaplica o valor se for remontado. */}
          <select key={values.target ?? ""} name="target" required defaultValue={values.target ?? ""} className={selectClass}>
            <option value="" disabled>
              Escolha
            </option>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {errors.target && <span className="text-sm font-normal text-danger">{errors.target[0]}</span>}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Por quanto tempo
          <select key={values.days ?? ""} name="days" required defaultValue={values.days ?? String(sponsorshipDays[0])} className={selectClass}>
            {sponsorshipDays.map((days) => (
              <option key={days} value={days}>
                {days} dias
              </option>
            ))}
          </select>
          {errors.days && <span className="text-sm font-normal text-danger">{errors.days[0]}</span>}
        </label>
      </div>
      <Button type="submit" loading={pending} className="self-start">
        Destacar
      </Button>
    </form>
  );
}

/** Encerrar um destaque antes do fim do período. */
export function EndSponsorshipButton({ sponsorshipId, targetName }: { sponsorshipId: string; targetName: string }) {
  const [state, action, pending] = useActionState<FormState<Sponsorship>, FormData>(endSponsorshipAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="sponsorshipId" value={sponsorshipId} />
      <Button type="submit" size="sm" variant="ghost" loading={pending} aria-label={`Encerrar o destaque de ${targetName}`}>
        Encerrar
      </Button>
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível encerrar."}</FormAlert>}
    </form>
  );
}
