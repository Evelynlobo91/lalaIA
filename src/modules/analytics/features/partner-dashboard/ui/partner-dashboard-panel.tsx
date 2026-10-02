import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import Link from "next/link";
import { Button, Card, EmptyState, cn } from "@/shared/ui";
import { PERIODS } from "../partner-dashboard.schema";
import type { MetricId, MetricView, PartnerDashboardView } from "../partner-dashboard.use-case";

const int = new Intl.NumberFormat("pt-BR");
const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const value = (m: Pick<MetricView, "unit">, n: number) => (m.unit === "percent" ? `${pct.format(n)}%` : int.format(n));
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const typeLabel = { place: "Lugar", event: "Evento", mission: "Missão" } as const;

export const chartMetricIds: MetricId[] = ["views", "favorites", "queroIr", "liveViews", "checkins", "conversion"];

type Props = { view: PartnerDashboardView; chart: MetricId; basePath?: string };

function href(view: PartnerDashboardView, change: { periodo?: number; recurso?: string | null; grafico?: MetricId }, chart: MetricId, basePath: string) {
  const q = new URLSearchParams({ periodo: String(change.periodo ?? view.period), grafico: change.grafico ?? chart });
  const recurso = change.recurso === undefined ? view.selected : change.recurso;
  if (recurso) q.set("recurso", recurso);
  return `${basePath}?${q.toString()}`;
}

const chip = (active: boolean) =>
  cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium", active ? "border-brand bg-brand text-brand-fg" : "border-border hover:bg-surface");

/** Variação contra o período anterior, em texto + ícone (nunca só cor). */
function Delta({ metric, period }: { metric: MetricView; period: number }) {
  const diff = metric.total - metric.previousTotal;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : ArrowRight;
  const text =
    metric.unit === "percent"
      ? `${diff > 0 ? "+" : ""}${pct.format(diff)} p.p.`
      : metric.previousTotal === 0
        ? diff === 0
          ? "sem mudança"
          : `+${int.format(diff)}`
        : `${diff > 0 ? "+" : ""}${pct.format((diff / metric.previousTotal) * 100)}%`;
  return (
    <p className="inline-flex items-center gap-1 text-xs text-muted">
      <Icon aria-hidden className="size-3.5" />
      {text} <span className="sr-only">em relação aos</span> vs. {period} dias anteriores
    </p>
  );
}

/** Barras diárias de uma métrica (uma série: sem legenda; o título nomeia). Tooltip por barra e tabela. */
function DailyBars({ metric }: { metric: MetricView }) {
  const W = 640;
  const H = 180;
  const pad = { top: 8, right: 4, bottom: 22, left: 36 };
  const max = Math.max(1, ...metric.series.map((p) => p.value));
  const step = (W - pad.left - pad.right) / metric.series.length;
  const barW = Math.max(2, Math.min(28, step - 2)); // 2px de espaço entre barras
  const y = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(metric.series.length / 7);

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric.label} por dia`} className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[10px]">
              {value(metric, metric.unit === "percent" ? t : Math.round(t))}
            </text>
          </g>
        ))}
        {metric.series.map((p, i) => {
          const x = pad.left + i * step + (step - barW) / 2;
          const top = y(p.value);
          const h = Math.max(0, H - pad.bottom - top);
          return (
            <g key={p.day} className="group">
              <title>{`${dayLabel(p.day)}: ${value(metric, p.value)}`}</title>
              {/* Alvo de toque maior que a barra. */}
              <rect x={pad.left + i * step} y={pad.top} width={step} height={H - pad.top - pad.bottom} fill="transparent" />
              {h > 0 && <rect x={x} y={top} width={barW} height={h} rx={Math.min(4, barW / 2)} className="fill-brand group-hover:opacity-80" />}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[10px]">
                  {dayLabel(p.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Ver em tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted">
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 text-right font-medium">{metric.label}</th>
            </tr>
          </thead>
          <tbody>
            {metric.series.map((p) => (
              <tr key={p.day} className="border-t border-border">
                <td className="py-1">{dayLabel(p.day)}</td>
                <td className="py-1 text-right tabular-nums">{value(metric, p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** #78 — Painel de dados do promotor: filtros, 6 indicadores, gráfico diário e detalhamento por recurso. */
export function PartnerDashboardPanel({ view, chart, basePath = "/parceiro/dados" }: Props) {
  if (view.resources.length === 0) {
    return <EmptyState title="Ainda não há o que medir" description="Reivindique um lugar, crie um evento ou uma missão para ver os dados aqui." />;
  }
  const chartMetric = view.metrics.find((m) => m.id === chart) ?? view.metrics[0]!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <nav aria-label="Período" className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Link key={p} href={href(view, { periodo: p }, chart, basePath)} aria-current={view.period === p ? "true" : undefined} className={chip(view.period === p)}>
              {p} dias
            </Link>
          ))}
        </nav>
        <form action={basePath} className="flex items-center gap-2">
          <input type="hidden" name="periodo" value={view.period} />
          <input type="hidden" name="grafico" value={chart} />
          <label htmlFor="recurso" className="sr-only">
            Lugar, evento ou missão
          </label>
          <select id="recurso" name="recurso" defaultValue={view.selected ?? ""} className="h-11 min-w-0 rounded-full border border-border bg-surface px-4 text-sm">
            <option value="">Todos os recursos</option>
            {view.resources.map((r) => (
              <option key={r.key} value={r.key}>
                {typeLabel[r.type]}: {r.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary">
            Filtrar
          </Button>
        </form>
      </div>

      <ul aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {view.metrics.map((m) => (
          <li key={m.id}>
            <Link href={href(view, { grafico: m.id }, chart, basePath)} aria-current={m.id === chartMetric.id ? "true" : undefined} className="block h-full rounded-2xl">
              <Card as="div" className={cn("flex h-full flex-col gap-1", m.id === chartMetric.id && "ring-2 ring-brand")}>
                <span className="text-sm text-muted">{m.label}</span>
                <span className="text-2xl font-bold tabular-nums">{value(m, m.total)}</span>
                <Delta metric={m} period={view.period} />
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="grafico" className="flex flex-col gap-2">
        <h2 id="grafico" className="text-lg font-semibold">
          {chartMetric.label} por dia
        </h2>
        <DailyBars metric={chartMetric} />
      </section>

      <section aria-labelledby="detalhe" className="flex flex-col gap-2">
        <h2 id="detalhe" className="text-lg font-semibold">
          Por recurso
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-2 font-medium">Recurso</th>
                {(["views", "favorites", "queroIr", "liveViews", "checkins"] as const).map((id) => (
                  <th key={id} className="py-2 text-right font-medium">
                    {view.metrics.find((m) => m.id === id)!.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.breakdown.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="py-2">
                    <span className="text-muted">{typeLabel[r.type]}:</span> {r.name}
                  </td>
                  {(["views", "favorites", "queroIr", "liveViews", "checkins"] as const).map((id) => (
                    <td key={id} className="py-2 text-right tabular-nums">
                      {int.format(r.totals[id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-muted">
        Período de {dayLabel(view.from)} a {dayLabel(view.to)} (horário de Joinville). Visualizações contam uma vez por aba aberta; conversão = (“Quero ir” +
        check-ins) ÷ visualizações. Só contagens: o LalaIA não registra quem fez cada ação.
      </p>
    </div>
  );
}
