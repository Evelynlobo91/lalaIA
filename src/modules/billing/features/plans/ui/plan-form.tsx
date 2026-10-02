"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { planFeatures, type Plan, type PlanFeature } from "../../../domain/plan";
import { savePlanAction } from "../plans.actions";

export type PlanFormValues = { planId?: string; code: string; name: string; description: string; price: string; features: PlanFeature[]; isDefault: boolean; active: boolean };

/** Cadastro e edição de plano (#152): nome, mensalidade e os recursos que ele libera. */
export function PlanForm({ initial, submitLabel }: { initial?: PlanFormValues; submitLabel: string }) {
  const [state, action, pending] = useActionState<FormState<Plan>, FormData>(savePlanAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const kept = state.status === "error" ? (state.values ?? {}) : {};
  const text = (field: "code" | "name" | "description" | "price") => kept[field] ?? initial?.[field];
  // Depois de um erro, o React restaura os campos: `key` refaz os checkboxes com o estado inicial do formulário.
  const boxKey = state.status;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {initial?.planId && <input type="hidden" name="planId" value={initial.planId} />}
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" name="name" required maxLength={60} defaultValue={text("name")} errors={errors.name} />
        <TextField label="Código" name="code" required maxLength={30} defaultValue={text("code")} errors={errors.code} hint="Identificador sem espaços, ex.: pro." />
      </div>
      <TextField label="Mensalidade (R$)" name="price" inputMode="decimal" placeholder="Deixe vazio se for gratuito" defaultValue={text("price")} errors={errors.price} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Descrição
        <textarea name="description" maxLength={300} rows={2} defaultValue={text("description")} className="rounded-xl border border-border bg-surface px-3 py-2 text-base font-normal" />
        {errors.description && <span className="text-sm font-normal text-danger">{errors.description[0]}</span>}
      </label>

      <fieldset key={`recursos-${boxKey}`} className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Recursos liberados</legend>
        {planFeatures.map((feature) => (
          <label key={feature.id} className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="features" value={feature.id} defaultChecked={initial?.features.includes(feature.id)} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
            <span>
              <span className="font-medium">{feature.label}</span>
              <span className="block text-muted">{feature.description}</span>
            </span>
          </label>
        ))}
        {errors.features && <span className="text-sm text-danger">{errors.features[0]}</span>}
      </fieldset>

      <fieldset key={`situacao-${boxKey}`} className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Situação</legend>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
          <span>
            <span className="font-medium">Ativo</span>
            <span className="block text-muted">Plano inativo não aceita novas assinaturas.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="isDefault" defaultChecked={initial?.isDefault ?? false} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
          <span>
            <span className="font-medium">Plano padrão</span>
            <span className="block text-muted">Vale para o parceiro que não tem assinatura. Marcar aqui tira o padrão do plano atual.</span>
          </span>
        </label>
      </fieldset>

      <Button type="submit" loading={pending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
