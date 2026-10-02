import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import Link from "next/link";
import { Card, cn } from "@/shared/ui";
import { changeLabel, metricPeriods, type PlatformMetricView, type PlatformMetricsView } from "../platform-metrics.use-case";

const int = new Intl.NumberFormat("pt-BR");

const chip = (active: boolean) =>
  cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface hover:border-brand");

/** Variação contra o período anterior, em texto + ícone (nunca só cor). */
function Change({ metric, period }: { metric: PlatformMetricView; period: number }) {
  const diff = metric.current - metric.previous;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : ArrowRight;
  return (
    <p className="inline-flex items-center gap-1 text-xs text-muted">
      <Icon aria-hidden className="size-3.5" />
      {changeLabel(metric.current, metric.previous)} <span className="sr-only">em relação aos</span> vs. {period} dias anteriores
    </p>
  );
}

/** Métricas gerais da plataforma (#145): período, números com variação e a mesma informação em tabela. */
export function PlatformMetricsPanel({ view }: { view: PlatformMetricsView }) {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Período">
        <ul className="flex flex-wrap gap-2">
          {metricPeriods.map((days) => (
            <li key={days}>
              <Link href={`/admin/metricas?periodo=${days}`} aria-current={days === view.period ? "page" : undefined} className={chip(days === view.period)}>
                {days} dias
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`Números dos últimos ${view.period} dias`}>
        {view.metrics.map((metric) => (
          <li key={metric.id}>
            <Card as="div" className="flex h-full flex-col gap-1">
              <p className="text-sm text-muted">{metric.label}</p>
              <p className="text-3xl font-bold tabular-nums">{int.format(metric.current)}</p>
              <Change metric={metric} period={view.period} />
              {metric.total && (
                <p className="text-sm text-muted">
                  <span className="font-medium text-fg tabular-nums">{int.format(metric.total.value)}</span> {metric.total.label}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <details className="rounded-2xl border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">Ver em tabela</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">Números gerais da plataforma nos últimos {view.period} dias e nos {view.period} dias anteriores</caption>
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Métrica
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Últimos {view.period} dias
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  {view.period} dias anteriores
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Total hoje
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {view.metrics.map((metric) => (
                <tr key={metric.id}>
                  <th scope="row" className="py-2 pr-4 font-normal">
                    {metric.label}
                  </th>
                  <td className="py-2 pr-4 text-right tabular-nums">{int.format(metric.current)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{int.format(metric.previous)}</td>
                  <td className="py-2 text-right tabular-nums">{metric.total ? int.format(metric.total.value) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
