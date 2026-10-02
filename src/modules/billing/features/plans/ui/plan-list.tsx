import Link from "next/link";
import { Badge, Card } from "@/shared/ui";
import { featureLabel, formatPlanPrice, type Plan } from "../../../domain/plan";

/** Planos no backoffice (#152): preço, recursos e situação, com atalho para editar. */
export function PlanList({ plans, canWrite }: { plans: Plan[]; canWrite: boolean }) {
  if (plans.length === 0) return <p className="text-muted">Nenhum plano cadastrado.</p>;
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label="Planos">
      {plans.map((plan) => (
        <li key={plan.id}>
          <Card className="flex h-full flex-col gap-2" aria-label={`Plano ${plan.name}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-semibold leading-tight">{plan.name}</p>
                <p className="text-sm text-muted">{formatPlanPrice(plan.priceCents)}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {plan.isDefault && <Badge variant="brand">Padrão</Badge>}
                <Badge variant={plan.active ? "success" : "neutral"}>{plan.active ? "Ativo" : "Inativo"}</Badge>
              </div>
            </div>
            {plan.description && <p className="text-sm">{plan.description}</p>}
            <p className="text-sm text-muted">{plan.features.length ? `Libera: ${plan.features.map(featureLabel).join(", ")}.` : "Não libera nenhum recurso."}</p>
            {canWrite && (
              <Link href={`/admin/financeiro/planos/${plan.id}`} prefetch={false} className="mt-auto inline-flex min-h-11 items-center self-start text-sm font-medium text-brand underline" aria-label={`Editar plano ${plan.name}`}>
                Editar
              </Link>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
