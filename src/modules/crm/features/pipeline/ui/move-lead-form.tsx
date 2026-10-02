"use client";

import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { stageLabel, type Lead, type LeadStage } from "../../../domain/lead";
import { nextStages } from "../../../domain/pipeline";
import { moveLeadAction } from "../pipeline.actions";

/**
 * Move o lead de etapa (#148) sem arrastar: um seletor e um botão, que funcionam por teclado e no celular.
 * "Perdido" abre o campo de motivo, que é obrigatório.
 */
export function MoveLeadForm({ leadId, businessName, stage }: { leadId: string; businessName: string; stage: LeadStage }) {
  const [state, action, pending] = useActionState<FormState<Lead>, FormData>(moveLeadAction, idleFormState);
  const options = nextStages(stage);
  const [to, setTo] = useState<LeadStage | "">("");
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (options.length === 0) return null;

  return (
    <form action={action} className="flex flex-col gap-2" aria-label={`Mover ${businessName}`}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="from" value={stage} />
      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted">
          Mover para
          <select
            name="to"
            required
            value={to}
            onChange={(event) => setTo(event.target.value as LeadStage | "")}
            className="h-11 rounded-xl border border-border bg-surface px-2 text-sm font-normal text-fg"
          >
            <option value="" disabled>
              Escolha
            </option>
            {options.map((option) => (
              <option key={option} value={option}>
                {stageLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!to} className="h-11">
          Mover
        </Button>
      </div>

      {to === "perdido" && (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Motivo da perda
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={500}
            rows={2}
            defaultValue={state.status === "error" ? state.values?.reason : undefined}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal text-fg"
          />
          {errors.reason && <span className="text-sm font-normal text-danger">{errors.reason[0]}</span>}
        </label>
      )}

      {state.status === "error" && state.message && <FormAlert>{state.message}</FormAlert>}
    </form>
  );
}
