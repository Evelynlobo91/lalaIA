"use client";

import { Pause, Play, Square } from "lucide-react";
import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import type { StreamRecord, StreamStatus } from "../../../domain/stream";
import { controlStreamAction } from "../stream-control.actions";

/** Ativar / pausar / encerrar. Encerrar pede confirmação (derruba a transmissão na hora). */
export function StreamControls({ streamId, status, label }: { streamId: string; status: StreamStatus; label: string }) {
  const [state, action, pending] = useActionState<FormState<StreamRecord>, FormData>(controlStreamAction, idleFormState);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="streamId" value={streamId} />
      <div className="flex flex-wrap items-center gap-2">
        {(status === "paused" || status === "ended") && (
          <Button type="submit" name="action" value="activate" size="sm" loading={pending} aria-label={`Ativar a transmissão de ${label}`}>
            <Play aria-hidden className="size-4" /> Ativar
          </Button>
        )}
        {(status === "live" || status === "waiting") && (
          <Button type="submit" name="action" value="pause" size="sm" variant="secondary" loading={pending} aria-label={`Pausar a transmissão de ${label}`}>
            <Pause aria-hidden className="size-4" /> Pausar
          </Button>
        )}
        {status !== "ended" &&
          (confirmingEnd ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Encerrar agora? A transmissão cai na hora e a chave é desativada.</span>
              <Button type="submit" name="action" value="end" size="sm" variant="danger" loading={pending}>
                Sim, encerrar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingEnd(false)}>
                Voltar
              </Button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingEnd(true)} aria-label={`Encerrar a transmissão de ${label}`}>
              <Square aria-hidden className="size-4" /> Encerrar
            </Button>
          ))}
      </div>
      {status === "paused" && <p className="text-sm text-muted">Pausada: o público não vê o vídeo, mas o OBS/Larix continua conectado.</p>}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message ?? "Não foi possível alterar a transmissão."}
        </p>
      )}
    </form>
  );
}
