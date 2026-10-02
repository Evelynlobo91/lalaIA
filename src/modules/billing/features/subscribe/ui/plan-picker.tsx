"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Badge, Button, ButtonLink, Card, FormAlert } from "@/shared/ui";
import { featureLabel, formatPlanPrice, type Plan } from "../../../domain/plan";
import { subscribeAction, type SubscribeResult } from "../subscribe.actions";

export type PlanChoice = Pick<Plan, "id" | "name" | "description" | "priceCents" | "features"> & {
  /** current: vale agora · pending: escolhido, aguardando pagamento · available: pode assinar. */
  state: "current" | "pending" | "available";
  /** Em relação ao plano que vale agora: mais caro (upgrade), mais barato (downgrade) ou igual. */
  change: "upgrade" | "downgrade" | "same";
};

function PlanCard({ plan }: { plan: PlanChoice }) {
  const [state, action, pending] = useActionState<FormState<SubscribeResult>, FormData>(subscribeAction, idleFormState);
  const actionLabel = plan.change === "upgrade" ? "Fazer upgrade" : plan.change === "downgrade" ? "Fazer downgrade" : "Assinar";

  return (
    <Card className="flex h-full flex-col gap-3" aria-label={`Plano ${plan.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{plan.name}</p>
          <p className="text-sm text-muted">{formatPlanPrice(plan.priceCents)}</p>
        </div>
        {plan.state === "current" && <Badge variant="success">Seu plano</Badge>}
        {plan.state === "pending" && <Badge variant="warning">Aguardando pagamento</Badge>}
      </div>
      {plan.description && <p className="text-sm">{plan.description}</p>}
      <ul className="flex flex-col gap-1 text-sm" aria-label={`Recursos do plano ${plan.name}`}>
        {plan.features.map((feature) => (
          <li key={feature}>✓ {featureLabel(feature)}</li>
        ))}
      </ul>

      {state.status === "error" && <FormAlert>{state.message ?? "Não foi possível assinar agora. Tente de novo."}</FormAlert>}
      {state.status === "success" &&
        (state.data.paymentUrl ? (
          <div className="flex flex-col gap-2" role="status">
            <FormAlert variant="success">Fatura do plano {state.data.planName} gerada. O plano passa a valer quando o pagamento for confirmado.</FormAlert>
            <ButtonLink href={state.data.paymentUrl} className="self-start">
              Pagar agora
            </ButtonLink>
          </div>
        ) : (
          <FormAlert variant="success">Pronto: o plano {state.data.planName} já está valendo.</FormAlert>
        ))}

      {plan.state !== "current" && state.status !== "success" && (
        <form action={action} className="mt-auto">
          <input type="hidden" name="planId" value={plan.id} />
          <Button type="submit" loading={pending} variant={plan.state === "pending" ? "secondary" : "primary"} aria-label={`${plan.state === "pending" ? "Ver pagamento do plano" : `${actionLabel} para o plano`} ${plan.name}`}>
            {plan.state === "pending" ? "Ver pagamento" : actionLabel}
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Planos disponíveis para o parceiro (#153), com o que vale hoje e o botão de assinar. */
export function PlanPicker({ plans }: { plans: PlanChoice[] }) {
  if (plans.length === 0) return <p className="text-muted">Nenhum plano disponível no momento.</p>;
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label="Planos disponíveis">
      {plans.map((plan) => (
        <li key={plan.id}>
          <PlanCard plan={plan} />
        </li>
      ))}
    </ul>
  );
}
