"use client";

import { Radio } from "lucide-react";
import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import type { StreamRecord } from "../../../domain/stream";
import { provisionStreamAction } from "../stream-key.actions";

/** Gera a transmissão (e a chave) de um lugar ou evento do parceiro. */
export function ProvisionStreamButton({ entityType, entityId, label }: { entityType: "place" | "event"; entityId: string; label: string }) {
  const [state, action, pending] = useActionState<FormState<StreamRecord>, FormData>(provisionStreamAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <Button type="submit" size="sm" loading={pending} className="self-start" aria-label={`Gerar chave de transmissão para ${label}`}>
        <Radio aria-hidden className="size-4" /> Gerar chave de transmissão
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message ?? "Não foi possível gerar a chave."}
        </p>
      )}
    </form>
  );
}
