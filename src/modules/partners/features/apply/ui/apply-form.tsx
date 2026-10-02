"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField, cn } from "@/shared/ui";
import { partnerKinds, type PartnerApplication, type PartnerApplicationData } from "../../../domain/partner";
import { applyAction } from "../apply.action";

const formatPhone = (digits: string) => digits.replace(/^\+?55/, "").replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

export function ApplyForm({ current, submitLabel = "Enviar para análise" }: { current?: PartnerApplicationData | null; submitLabel?: string }) {
  const [state, action, pending] = useActionState<FormState<PartnerApplication>, FormData>(applyAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values =
    state.status === "error"
      ? (state.values ?? {})
      : current
        ? { ...current, phone: formatPhone(current.phone), instagram: current.instagram ? `@${current.instagram}` : "", cnpj: current.cnpj ?? "" }
        : {};

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Você é</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {partnerKinds.map((k) => (
            <label
              key={k.id}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 rounded-2xl border border-border p-4",
                "has-[:checked]:border-brand has-[:checked]:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="kind" value={k.id} defaultChecked={values.kind === k.id} className="accent-[var(--brand)]" />
                {k.label}
              </span>
              <span className="pl-6 text-sm text-muted">{k.hint}</span>
            </label>
          ))}
        </div>
        {errors.kind && <p className="text-sm text-danger">{errors.kind[0]}</p>}
      </fieldset>

      <TextField label="Nome do negócio" name="businessName" maxLength={120} required defaultValue={values.businessName} errors={errors.businessName} />
      <TextField label="Telefone com DDD" name="phone" type="tel" autoComplete="tel" inputMode="tel" required defaultValue={values.phone} errors={errors.phone} />
      <TextField label="Instagram (opcional)" name="instagram" placeholder="@seunegocio" defaultValue={values.instagram} errors={errors.instagram} />
      <TextField label="CNPJ (opcional)" name="cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" defaultValue={values.cnpj} errors={errors.cnpj} />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Conte sobre o seu negócio e o que pretende divulgar
        <textarea
          name="description"
          required
          minLength={20}
          maxLength={600}
          rows={4}
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
