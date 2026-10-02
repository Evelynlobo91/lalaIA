"use client";

import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import type { Offer } from "../../../domain/offer";
import { endOfferAction } from "../manage-offers.actions";

/** Encerrar pede confirmação (é definitivo). */
export function EndOfferButton({ offerId, title }: { offerId: string; title: string }) {
  const [state, action, pending] = useActionState<FormState<Offer>, FormData>(endOfferAction, idleFormState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`Encerrar ${title}`}>
        Encerrar
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <span className="text-sm">Encerrar esta oferta? Ninguém mais poderá resgatá-la; os códigos já emitidos valem até o fim da validade.</span>
      <Button type="submit" size="sm" variant="danger" loading={pending}>
        Sim, encerrar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Voltar
      </Button>
      {state.status === "error" && <span className="text-sm text-danger">{state.message}</span>}
    </form>
  );
}
