"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import type { PlaceClaim } from "../../../domain/place-claim";
import { requestClaimAction } from "../claim-place.actions";

/** "É meu": pede o vínculo com um lugar da busca. */
export function ClaimButton({ placeId, placeName }: { placeId: string; placeName: string }) {
  const [state, action, pending] = useActionState<FormState<PlaceClaim>, FormData>(requestClaimAction, idleFormState);

  if (state.status === "success") return <p className="text-sm font-medium text-success">Pedido enviado</p>;
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="placeId" value={placeId} />
      <Button type="submit" size="sm" loading={pending} aria-label={`Reivindicar ${placeName}`}>
        É meu
      </Button>
      {state.status === "error" && (
        <p role="alert" className="max-w-56 text-right text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
