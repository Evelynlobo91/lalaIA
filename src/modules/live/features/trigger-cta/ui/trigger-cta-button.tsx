"use client";

import { Zap } from "lucide-react";
import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { formatTime } from "@/shared/time/joinville-time";
import { Button } from "@/shared/ui";
import type { CtaRecord } from "../../../domain/cta";
import { triggerCtaAction } from "../trigger-cta.actions";
import { TRIGGER_MINUTES } from "../trigger-cta.use-case";

/**
 * Soltar a chamada agora (#181). `runningUntil` (ISO): até quando a chamada solta à mão fica no ar, calculado
 * no servidor; null se não está no ar por disparo. `live`: só dá para soltar com a transmissão ao vivo.
 */
export function TriggerCtaButton({ ctaId, title, live, runningUntil }: { ctaId: string; title: string; live: boolean; runningUntil: string | null }) {
  const [state, action, pending] = useActionState<FormState<CtaRecord>, FormData>(triggerCtaAction, idleFormState);

  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="ctaId" value={ctaId} />
      {runningUntil ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-success" role="status">
            No ar até {formatTime(new Date(runningUntil))}
          </span>
          <Button type="submit" name="intent" value="stop" size="sm" variant="secondary" loading={pending} aria-label={`Tirar do ar a chamada ${title}`}>
            Tirar do ar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Por quanto tempo soltar a chamada {title}</span>
            <select name="minutes" defaultValue={TRIGGER_MINUTES[0]} disabled={!live} className="h-9 rounded-xl border border-border bg-surface px-2 text-sm">
              {TRIGGER_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" name="intent" value="trigger" size="sm" variant="secondary" loading={pending} disabled={!live} aria-label={`Soltar agora a chamada ${title}`}>
            <Zap aria-hidden className="size-4" /> Soltar agora
          </Button>
          {!live && <span className="text-sm text-muted">Disponível com a live no ar.</span>}
        </div>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message ?? "Não foi possível soltar a chamada."}
        </p>
      )}
    </form>
  );
}
