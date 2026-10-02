"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert, TextField } from "@/shared/ui";
import { leadSources, type Lead } from "../../../domain/lead";
import { saveLeadAction } from "../leads.actions";

export type LeadFormValues = { leadId?: string; businessName: string; contactName: string; contactPhone: string; contactEmail: string; source: string; ownerId: string };

const selectClass = "h-12 rounded-xl border border-border bg-surface px-3 text-base font-normal";

/** Cadastro e edição de lead (#147). `owners` são as pessoas do time que podem ser responsáveis. */
export function LeadForm({ initial, owners, submitLabel }: { initial?: Partial<LeadFormValues>; owners: Array<{ id: string; name: string }>; submitLabel: string }) {
  const [state, action, pending] = useActionState<FormState<Lead>, FormData>(saveLeadAction, idleFormState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values: Partial<LeadFormValues> = state.status === "error" ? (state.values ?? {}) : (initial ?? {});

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {values.leadId && <input type="hidden" name="leadId" value={values.leadId} />}
      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}

      <TextField label="Estabelecimento" name="businessName" required maxLength={120} defaultValue={values.businessName} errors={errors.businessName} />
      <TextField label="Nome do contato" name="contactName" required maxLength={120} defaultValue={values.contactName} errors={errors.contactName} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Telefone do contato" name="contactPhone" type="tel" placeholder="(47) 99999-0000" defaultValue={values.contactPhone} errors={errors.contactPhone} hint="Telefone ou e-mail: pelo menos um." />
        <TextField label="E-mail do contato" name="contactEmail" type="email" maxLength={254} defaultValue={values.contactEmail} errors={errors.contactEmail} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Origem
          {/* `key`: depois de um erro o React restaura os campos; o select só reaplica o valor se for remontado. */}
          <select key={values.source ?? ""} name="source" required defaultValue={values.source ?? ""} className={selectClass}>
            <option value="" disabled>
              Escolha
            </option>
            {leadSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {errors.source && <span className="text-sm font-normal text-danger">{errors.source[0]}</span>}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Responsável
          <select key={values.ownerId ?? ""} name="ownerId" required defaultValue={values.ownerId ?? ""} className={selectClass}>
            <option value="" disabled>
              Escolha
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {errors.ownerId && <span className="text-sm font-normal text-danger">{errors.ownerId[0]}</span>}
        </label>
      </div>

      <Button type="submit" loading={pending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
