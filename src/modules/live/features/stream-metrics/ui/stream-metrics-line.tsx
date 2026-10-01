import { Eye, MousePointerClick } from "lucide-react";
import { METRICS_RECENT_DAYS } from "../stream-metrics.schema";
import type { StreamMetrics } from "../stream-metrics.use-case";

const number = new Intl.NumberFormat("pt-BR");

/** Portal: quantas vezes assistiram e quantos acessos a página teve (RF25). Só contagens, sem quem. */
export function StreamMetricsLine({ metrics, label }: { metrics: StreamMetrics; label: string }) {
  return (
    <dl aria-label={`Métricas da transmissão de ${label}`} className="grid grid-cols-2 gap-2 text-sm">
      <div className="flex flex-col gap-0.5 rounded-xl bg-surface-2 p-3">
        <dt className="flex items-center gap-1.5 text-muted">
          <Eye aria-hidden className="size-4" /> Assistiram
        </dt>
        <dd className="text-lg font-semibold">{number.format(metrics.watched.total)}</dd>
        <dd className="text-muted">
          {number.format(metrics.watched.recent)} nos últimos {METRICS_RECENT_DAYS} dias
        </dd>
      </div>
      <div className="flex flex-col gap-0.5 rounded-xl bg-surface-2 p-3">
        <dt className="flex items-center gap-1.5 text-muted">
          <MousePointerClick aria-hidden className="size-4" /> Acessos à página
        </dt>
        <dd className="text-lg font-semibold">{number.format(metrics.pageViews.total)}</dd>
        <dd className="text-muted">
          {number.format(metrics.pageViews.recent)} nos últimos {METRICS_RECENT_DAYS} dias
        </dd>
      </div>
    </dl>
  );
}
