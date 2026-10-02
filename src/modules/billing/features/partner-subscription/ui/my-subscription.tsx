import Link from "next/link";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card, type BadgeVariant } from "@/shared/ui";
import { featureLabel, formatPlanPrice } from "../../../domain/plan";
import { invoiceStatusLabels, subscriptionStatusLabels, type InvoiceStatus, type SubscriptionStatus } from "../../../domain/subscription";
import type { InvoiceView, MySubscriptionView } from "../partner-subscription";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** "2026-10-05" → "05/10/2026". */
const day = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;

const subscriptionBadge: Record<SubscriptionStatus, BadgeVariant> = { pending: "warning", active: "success", past_due: "warning", suspended: "danger", cancelled: "neutral" };
const invoiceBadge: Record<InvoiceStatus, BadgeVariant> = { pending: "warning", paid: "success", overdue: "danger", refunded: "neutral", cancelled: "neutral" };

/** Resumo da assinatura (#155): plano que vale agora, situação, renovação e troca pendente. */
export function SubscriptionSummary({ view }: { view: MySubscriptionView }) {
  const { currentPlan, status, renewsAt, pendingPlanName } = view;
  return (
    <Card className="flex flex-col gap-2" aria-label="Plano atual">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-muted">Plano atual</p>
          <p className="text-xl font-bold">{currentPlan?.name ?? "Sem plano"}</p>
          {currentPlan && <p className="text-sm text-muted">{formatPlanPrice(currentPlan.priceCents)}</p>}
        </div>
        {status && <Badge variant={subscriptionBadge[status]}>{subscriptionStatusLabels[status]}</Badge>}
      </div>
      {currentPlan && currentPlan.features.length > 0 && <p className="text-sm">Recursos: {currentPlan.features.map(featureLabel).join(", ")}.</p>}
      {renewsAt && <p className="text-sm text-muted">Próxima renovação em {formatDateTime(renewsAt)}.</p>}
      {pendingPlanName && (
        <p className="text-sm" role="status">
          O plano <strong>{pendingPlanName}</strong> passa a valer quando o pagamento for confirmado.
        </p>
      )}
      {status === "past_due" && <p className="text-sm text-danger">Há uma fatura vencida. Pague para não perder os recursos do plano.</p>}
      {status === "suspended" && <p className="text-sm text-danger">Assinatura suspensa por falta de pagamento: pague a fatura em aberto para o plano voltar a valer.</p>}
    </Card>
  );
}

function InvoiceRow({ invoice }: { invoice: InvoiceView }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-medium">
          {invoice.planName} · {brl(invoice.amountCents)}
        </p>
        <p className="text-sm text-muted">{invoice.paidAt ? `Paga em ${formatDateTime(invoice.paidAt)}` : `Vence em ${day(invoice.dueOn)}`}</p>
      </div>
      <Badge variant={invoiceBadge[invoice.status]}>{invoiceStatusLabels[invoice.status]}</Badge>
      {invoice.paymentUrl && (
        <Link
          href={invoice.paymentUrl}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand underline"
          aria-label={`${invoice.status === "overdue" ? "Segunda via" : "Pagar"}: ${invoice.planName}, vencimento ${day(invoice.dueOn)}`}
        >
          {invoice.status === "overdue" ? "Segunda via" : "Pagar"}
        </Link>
      )}
    </li>
  );
}

/** Faturas do parceiro (#155), da mais recente para a mais antiga, com o link de pagamento das que estão em aberto. */
export function InvoiceList({ invoices }: { invoices: InvoiceView[] }) {
  if (invoices.length === 0) return <p className="text-muted">Nenhuma fatura ainda.</p>;
  return (
    <Card className="p-0">
      <ul className="divide-y divide-border" aria-label="Faturas">
        {invoices.map((invoice) => (
          <InvoiceRow key={invoice.id} invoice={invoice} />
        ))}
      </ul>
    </Card>
  );
}
