"use client";

import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import { confirmPaymentAction } from "../confirm-payment.actions";

/**
 * Financeiro: confirmar que o pagamento de uma fatura foi recebido por fora. Pede confirmação, porque ativa o
 * plano do parceiro na hora e não se desfaz por aqui.
 */
export function ConfirmPaymentButton({ invoiceId, ownerName, amount }: { invoiceId: string; ownerName: string; amount: string }) {
  const [state, action, pending] = useActionState<FormState<{ invoiceId: string }>, FormData>(confirmPaymentAction, idleFormState);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {confirming ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            Recebeu {amount} de {ownerName}?
          </span>
          <Button type="submit" size="sm" loading={pending}>
            Sim, confirmar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Voltar
          </Button>
        </span>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)} aria-label={`Confirmar o pagamento de ${ownerName}`} className="self-start whitespace-nowrap">
          Confirmar pagamento
        </Button>
      )}
      {state.status === "error" && (
        <span role="alert" className="text-sm text-danger">
          {state.message ?? "Não foi possível confirmar."}
        </span>
      )}
    </form>
  );
}
