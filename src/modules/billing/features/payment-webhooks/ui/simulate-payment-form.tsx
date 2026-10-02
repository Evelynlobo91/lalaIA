"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, ButtonLink, FormAlert } from "@/shared/ui";
import { simulatePaymentAction } from "../simulate-payment.action";

/** Botão do simulador de pagamento (provedor simulado): confirma o pagamento da cobrança, como o provedor faria. */
export function SimulatePaymentForm({ gatewayInvoiceId }: { gatewayInvoiceId: string }) {
  const [state, action, pending] = useActionState<FormState<{ paid: boolean }>, FormData>(simulatePaymentAction, idleFormState);

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-3" role="status">
        <FormAlert variant="success">Pagamento simulado confirmado. O plano já está valendo.</FormAlert>
        <ButtonLink href="/parceiro/assinatura" className="self-start">
          Ver minha assinatura
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="gatewayInvoiceId" value={gatewayInvoiceId} />
      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível simular o pagamento."}</FormAlert>}
      <Button type="submit" loading={pending} className="self-start">
        Simular pagamento
      </Button>
    </form>
  );
}
