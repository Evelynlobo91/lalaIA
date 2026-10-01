"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import { formatOfferCode } from "../../../domain/offer-code";
import { redeemOfferAction, type RedeemedCode } from "../redeem-offer.action";
import { RedemptionCode } from "./redemption-code";

/** "Resgatar": mostra o código na hora (e ele fica em "Meus resgates" no perfil). */
export function RedeemButton({ offerId, title }: { offerId: string; title: string }) {
  const [state, action, pending] = useActionState<FormState<RedeemedCode>, FormData>(redeemOfferAction, idleFormState);

  if (state.status === "success") return <RedemptionCode code={formatOfferCode(state.data.code)} />;

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <Button type="submit" loading={pending} aria-label={`Resgatar ${title}`} className="self-start">
        Resgatar
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message ?? "Não foi possível resgatar a oferta."}
        </p>
      )}
    </form>
  );
}
