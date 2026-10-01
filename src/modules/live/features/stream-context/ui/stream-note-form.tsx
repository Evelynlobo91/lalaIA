"use client";

import { MessageSquareText } from "lucide-react";
import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, TextField } from "@/shared/ui";
import { STREAM_NOTE_MAX, type StreamRecord } from "../../../domain/stream";
import { updateStreamNoteAction } from "../stream-context.actions";

/** Portal: o parceiro atualiza a situação atual que aparece junto da live (RF21). Vazio limpa. */
export function StreamNoteForm({ streamId, note, label }: { streamId: string; note: string | null; label: string }) {
  const [state, action, pending] = useActionState<FormState<StreamRecord>, FormData>(updateStreamNoteAction, idleFormState);
  const current = state.status === "success" ? state.data.note : note;

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="streamId" value={streamId} />
      <TextField
        name="note"
        label="Situação atual"
        aria-label={`Situação atual da transmissão de ${label}`}
        defaultValue={state.status === "error" ? (state.values?.note ?? current ?? "") : (current ?? "")}
        maxLength={STREAM_NOTE_MAX}
        placeholder='Ex.: "Show começa 22h", "Casa cheia"'
        hint="Aparece junto da live para o público. Deixe vazio para não mostrar nada."
        errors={state.status === "error" ? state.fieldErrors?.note : undefined}
      />
      <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
        <MessageSquareText aria-hidden className="size-4" /> Salvar situação
      </Button>
      <p className="text-sm" role="status" aria-live="polite">
        {state.status === "success" ? (current ? "Situação atualizada." : "Situação removida.") : null}
        {state.status === "error" && !state.fieldErrors?.note && <span className="text-danger">{state.message ?? "Não foi possível salvar."}</span>}
      </p>
    </form>
  );
}
