"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, Card, CardDescription, CardTitle, FormAlert } from "@/shared/ui";
import type { PlaceClaim, PlaceClaimView } from "../../../domain/place-claim";
import { approveClaimAction, rejectClaimAction } from "../claim-place.actions";

export function ClaimReviewQueue({ items }: { items: PlaceClaimView[] }) {
  if (items.length === 0) return <p className="text-muted">Nenhum pedido de vínculo aguardando análise.</p>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Pedidos de vínculo pendentes">
      {items.map((item) => (
        <li key={item.id}>
          <ClaimCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function ClaimCard({ item }: { item: PlaceClaimView }) {
  const [approveState, approve, approving] = useActionState<FormState<PlaceClaim>, FormData>(approveClaimAction, idleFormState);
  const [rejectState, reject, rejecting] = useActionState<FormState<PlaceClaim>, FormData>(rejectClaimAction, idleFormState);
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <Card className="flex flex-col gap-3" aria-label={`Vínculo: ${item.businessName} → ${item.placeName}`}>
      <div>
        <CardTitle className="text-base">
          {item.businessName} quer administrar{" "}
          <Link href={`/lugares/${item.placeId}`} target="_blank" className="text-brand underline">
            {item.placeName}
          </Link>
        </CardTitle>
        <CardDescription>Confira se o parceiro é mesmo responsável por esse lugar antes de aprovar.</CardDescription>
      </div>
      {approveState.status === "error" && <FormAlert>{approveState.message}</FormAlert>}
      <div className="flex flex-wrap gap-2">
        <form action={approve}>
          <input type="hidden" name="claimId" value={item.id} />
          <Button type="submit" size="sm" loading={approving}>
            <Check aria-hidden className="size-4" /> Aprovar vínculo
          </Button>
        </form>
        {!rejectOpen && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setRejectOpen(true)}>
            <X aria-hidden className="size-4" /> Recusar
          </Button>
        )}
      </div>
      {rejectOpen && (
        <form action={reject} className="flex flex-col gap-2">
          <input type="hidden" name="claimId" value={item.id} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Motivo da recusa
            <textarea name="reason" required minLength={5} maxLength={500} rows={2} className="rounded-xl border border-border bg-bg px-3 py-2 text-base font-normal" />
          </label>
          {rejectState.status === "error" && <p className="text-sm text-danger">{rejectState.fieldErrors?.reason?.[0] ?? rejectState.message}</p>}
          <Button type="submit" size="sm" variant="danger" loading={rejecting} className="self-start">
            Confirmar recusa
          </Button>
        </form>
      )}
    </Card>
  );
}
