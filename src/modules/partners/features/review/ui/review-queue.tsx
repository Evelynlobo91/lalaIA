"use client";

import { Check, X } from "lucide-react";
import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Badge, Button, Card, CardDescription, CardTitle, FormAlert } from "@/shared/ui";
import { partnerKinds, type PartnerApplication, type PartnerReviewItem } from "../../../domain/partner";
import { approveAction, rejectAction } from "../review.actions";

const kindLabel = new Map<string, string>(partnerKinds.map((k) => [k.id, k.label]));

export function ReviewQueue({ items }: { items: PartnerReviewItem[] }) {
  if (items.length === 0) return <p className="text-muted">Nenhum cadastro aguardando análise.</p>;
  return (
    <ul className="flex flex-col gap-4" aria-label="Cadastros pendentes">
      {items.map((item) => (
        <li key={item.id}>
          <ReviewCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function ReviewCard({ item }: { item: PartnerReviewItem }) {
  const [approveState, approve, approving] = useActionState<FormState<PartnerApplication>, FormData>(approveAction, idleFormState);
  const [rejectState, reject, rejecting] = useActionState<FormState<PartnerApplication>, FormData>(rejectAction, idleFormState);
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <Card className="flex flex-col gap-3" aria-label={`Cadastro de ${item.businessName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{item.businessName}</CardTitle>
          <CardDescription>
            {item.ownerName} · {item.ownerEmail}
          </CardDescription>
        </div>
        <Badge variant="brand">{kindLabel.get(item.kind)}</Badge>
      </div>
      <p className="text-sm">{item.description}</p>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Telefone</dt>
          <dd>{item.phone}</dd>
        </div>
        <div>
          <dt className="text-muted">Instagram</dt>
          <dd>{item.instagram ? `@${item.instagram}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">CNPJ</dt>
          <dd>{item.cnpj ?? "—"}</dd>
        </div>
      </dl>

      {approveState.status === "error" && <FormAlert>{approveState.message}</FormAlert>}
      {rejectState.status === "error" && rejectState.message && <FormAlert>{rejectState.message}</FormAlert>}

      <div className="flex flex-wrap gap-2">
        <form action={approve}>
          <input type="hidden" name="partnerId" value={item.id} />
          <Button type="submit" size="sm" loading={approving}>
            <Check aria-hidden className="size-4" /> Aprovar
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
          <input type="hidden" name="partnerId" value={item.id} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Motivo da recusa (a pessoa vai ver)
            <textarea name="reason" required minLength={5} maxLength={500} rows={2} className="rounded-xl border border-border bg-bg px-3 py-2 text-base font-normal" />
          </label>
          {rejectState.status === "error" && rejectState.fieldErrors?.reason && <p className="text-sm text-danger">{rejectState.fieldErrors.reason[0]}</p>}
          <Button type="submit" size="sm" variant="danger" loading={rejecting} className="self-start">
            Confirmar recusa
          </Button>
        </form>
      )}
    </Card>
  );
}
