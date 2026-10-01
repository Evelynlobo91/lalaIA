"use client";

import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import type { EventRecord } from "../../../domain/event";
import { cancelEventAction } from "../manage-events.actions";

/** Cancelar pede confirmação (é irreversível). */
export function CancelEventButton({ eventId, title }: { eventId: string; title: string }) {
  const [state, action, pending] = useActionState<FormState<EventRecord>, FormData>(cancelEventAction, idleFormState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Cancelar ${title}`}>
        Cancelar
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <span className="text-sm">Cancelar este evento? Não dá para desfazer.</span>
      <Button type="submit" size="sm" variant="danger" loading={pending}>
        Sim, cancelar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Voltar
      </Button>
      {state.status === "error" && <span className="text-sm text-danger">{state.message}</span>}
    </form>
  );
}
