import { Eye, MousePointerClick } from "lucide-react";
import type { CtaMetrics } from "../cta-metrics.use-case";

const number = new Intl.NumberFormat("pt-BR");

/** Portal: quantas vezes a chamada apareceu e quantos toques recebeu (#182). Só contagens, sem quem. */
export function CtaMetricsLine({ metrics, title }: { metrics: CtaMetrics; title: string }) {
  const rate = metrics.impressions > 0 ? Math.round((metrics.clicks / metrics.impressions) * 100) : null;
  return (
    <dl aria-label={`Resultado da chamada ${title}`} className="flex w-full flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      <div className="flex items-center gap-1.5">
        <Eye aria-hidden className="size-4" />
        <dt>Apareceu</dt>
        <dd className="font-semibold text-fg">{number.format(metrics.impressions)}</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <MousePointerClick aria-hidden className="size-4" />
        <dt>Toques</dt>
        <dd className="font-semibold text-fg">{number.format(metrics.clicks)}</dd>
        {rate !== null && <dd>({rate}%)</dd>}
      </div>
    </dl>
  );
}
