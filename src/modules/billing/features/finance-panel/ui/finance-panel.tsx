import Link from "next/link";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, Card, cn, type BadgeVariant } from "@/shared/ui";
import { invoiceStatusLabels, subscriptionStatusLabels, type InvoiceStatus, type SubscriptionStatus } from "../../../domain/subscription";
import { financePeriods, type FinancePanelView } from "../finance-panel";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = new Intl.NumberFormat("pt-BR");
/** "2026-10-05" → "05/10/2026". */
const day = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;

const invoiceBadge: Record<InvoiceStatus, BadgeVariant> = { pending: "warning", paid: "success", overdue: "danger", refunded: "neutral", cancelled: "neutral" };
const statusOrder: SubscriptionStatus[] = ["active", "past_due", "suspended", "pending", "cancelled"];
const invoiceFilters: Array<{ value: InvoiceStatus | undefined; label: string }> = [
  { value: undefined, label: "Todas" },
  { value: "pending", label: "Em aberto" },
  { value: "overdue", label: "Vencidas" },
  { value: "paid", label: "Pagas" },
  { value: "refunded", label: "Estornadas" },
  { value: "cancelled", label: "Canceladas" },
];

const chip = (active: boolean) =>
  cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface hover:border-brand");

function href(period: number, status: InvoiceStatus | undefined) {
  const query = new URLSearchParams({ periodo: String(period) });
  if (status) query.set("faturas", status);
  return `/admin/financeiro?${query}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card as="div" className="flex h-full flex-col gap-1">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/** Painel financeiro (#156): recebimentos do período, MRR, inadimplentes e faturas por situação. */
export function FinancePanel({ view }: { view: FinancePanelView }) {
  const { totals, period, invoiceStatus } = view;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="recebimentos">
        <h2 id="recebimentos" className="text-xl font-semibold">
          Recebimentos
        </h2>
        <nav aria-label="Período">
          <ul className="flex flex-wrap gap-2">
            {financePeriods.map((days) => (
              <li key={days}>
                <Link href={href(days, invoiceStatus)} aria-current={days === period ? "page" : undefined} className={chip(days === period)}>
                  {days} dias
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Números do financeiro">
          <li>
            <Stat label={`Recebido em ${period} dias`} value={brl(totals.receivedCents)} hint={`${int.format(totals.paidInvoices)} ${totals.paidInvoices === 1 ? "fatura paga" : "faturas pagas"}`} />
          </li>
          <li>
            <Stat label="MRR" value={brl(totals.mrrCents)} hint="Mensalidades das assinaturas em dia ou na carência" />
          </li>
          <li>
            <Stat label="Em aberto" value={brl(totals.pendingCents)} hint="Faturas ainda dentro do vencimento" />
          </li>
          <li>
            <Stat label="Vencido" value={brl(totals.overdueCents)} hint={totals.refundedCents > 0 ? `${brl(totals.refundedCents)} estornados em ${period} dias` : "Faturas vencidas e não pagas"} />
          </li>
        </ul>
        <p className="text-sm text-muted" aria-label="Assinaturas por situação">
          Assinaturas: {statusOrder.map((status) => `${int.format(totals.subscriptions[status])} ${subscriptionStatusLabels[status].toLowerCase()}`).join(" · ")}.
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="inadimplentes">
        <h2 id="inadimplentes" className="text-xl font-semibold">
          Inadimplentes ({view.delinquents.length})
        </h2>
        {view.delinquents.length === 0 ? (
          <p className="text-muted">Nenhuma assinatura com fatura vencida.</p>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border" aria-label="Inadimplentes">
              {view.delinquents.map((d) => (
                <li key={d.subscriptionId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate font-medium">{d.ownerName}</p>
                    <p className="truncate text-sm text-muted">
                      {d.ownerEmail} · Plano {d.planName} · vencida desde {day(d.oldestDueOn)}
                    </p>
                  </div>
                  <p className="font-medium tabular-nums">{brl(d.overdueCents)}</p>
                  <Badge variant={d.status === "suspended" ? "danger" : "warning"}>{subscriptionStatusLabels[d.status]}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="faturas">
        <h2 id="faturas" className="text-xl font-semibold">
          Faturas
        </h2>
        <nav aria-label="Situação da fatura">
          <ul className="flex flex-wrap gap-2">
            {invoiceFilters.map(({ value, label }) => (
              <li key={label}>
                <Link href={href(period, value)} aria-current={value === invoiceStatus ? "page" : undefined} className={chip(value === invoiceStatus)}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {view.invoices.length === 0 ? (
          <p className="text-muted">Nenhuma fatura {invoiceStatus ? "nesta situação" : "ainda"}.</p>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">Faturas mais recentes</caption>
              <thead className="border-b border-border text-muted">
                <tr>
                  {["Parceiro", "Plano", "Valor", "Vencimento", "Situação"].map((heading) => (
                    <th key={heading} scope="col" className="px-4 py-3 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {view.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <th scope="row" className="px-4 py-3 font-normal">
                      {invoice.ownerName}
                    </th>
                    <td className="px-4 py-3">{invoice.planName}</td>
                    <td className="px-4 py-3 tabular-nums">{brl(invoice.amountCents)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{day(invoice.dueOn)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={invoiceBadge[invoice.status]}>{invoiceStatusLabels[invoice.status]}</Badge>
                      {invoice.paidAt && <span className="ml-2 text-muted">{formatDateTime(invoice.paidAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
