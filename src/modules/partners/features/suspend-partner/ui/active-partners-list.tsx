"use client";

import { Ban, RotateCcw } from "lucide-react";
import { useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Badge, Button, Card, CardDescription, CardTitle, FormAlert } from "@/shared/ui";
import type { PartnerApplication, PartnerReviewItem } from "../../../domain/partner";
import { reactivateAction, suspendAction } from "../suspend-partner.actions";

export function ActivePartnersList({ items }: { items: PartnerReviewItem[] }) {
  if (items.length === 0) return <p className="text-muted">Nenhum parceiro aprovado ainda.</p>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Parceiros aprovados e suspensos">
      {items.map((item) => (
        <li key={item.id}>
          <PartnerCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function PartnerCard({ item }: { item: PartnerReviewItem }) {
  const [suspendState, suspend, suspending] = useActionState<FormState<PartnerApplication>, FormData>(suspendAction, idleFormState);
  const [reactivateState, reactivate, reactivating] = useActionState<FormState<PartnerApplication>, FormData>(reactivateAction, idleFormState);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const suspended = item.status === "suspended";

  return (
    <Card className="flex flex-col gap-3" aria-label={`Parceiro ${item.businessName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{item.businessName}</CardTitle>
          <CardDescription>
            {item.ownerName} · {item.ownerEmail}
          </CardDescription>
        </div>
        <Badge variant={suspended ? "danger" : "success"}>{suspended ? "Suspenso" : "Ativo"}</Badge>
      </div>

      {suspended && (
        <p className="text-sm">
          <span className="text-muted">Motivo:</span> {item.suspensionReason}
        </p>
      )}

      {suspendState.status === "error" && suspendState.message && <FormAlert>{suspendState.message}</FormAlert>}
      {reactivateState.status === "error" && <FormAlert>{reactivateState.message}</FormAlert>}

      {suspended ? (
        <form action={reactivate}>
          <input type="hidden" name="partnerId" value={item.id} />
          <Button type="submit" size="sm" variant="secondary" loading={reactivating}>
            <RotateCcw aria-hidden className="size-4" /> Reativar
          </Button>
        </form>
      ) : suspendOpen ? (
        <form action={suspend} className="flex flex-col gap-2">
          <input type="hidden" name="partnerId" value={item.id} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Motivo da suspensão (o parceiro vai ver)
            <textarea name="reason" required minLength={5} maxLength={500} rows={2} className="rounded-xl border border-border bg-surface px-3 py-2 text-base font-normal" />
          </label>
          {suspendState.status === "error" && suspendState.fieldErrors?.reason && <p className="text-sm text-danger">{suspendState.fieldErrors.reason[0]}</p>}
          <p className="text-sm text-muted">Eventos, missões, ofertas e lives deste parceiro somem do app até a reativação.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="danger" loading={suspending}>
              Confirmar suspensão
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuspendOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setSuspendOpen(true)}>
          <Ban aria-hidden className="size-4" /> Suspender
        </Button>
      )}
    </Card>
  );
}
