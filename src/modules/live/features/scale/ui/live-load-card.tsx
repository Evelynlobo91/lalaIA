import { AlertTriangle } from "lucide-react";
import { Card } from "@/shared/ui";
import type { LiveLoad } from "../scale.use-case";

const number = new Intl.NumberFormat("pt-BR");

/** Backoffice: carga das lives agora, consumo do mês e alertas contra os limites configurados (#56). */
export function LiveLoadCard({ load }: { load: LiveLoad }) {
  const stats: Array<[string, string, string?]> = [
    ["Lives no ar", number.format(load.liveStreams)],
    ["Assistindo agora", number.format(load.viewersNow), load.limits.maxConcurrentViewers > 0 ? `limite ${number.format(load.limits.maxConcurrentViewers)}` : "sem limite configurado"],
    ["Carga na aplicação", `${number.format(load.requestsPerSecond)} req/s`, "estimativa: status, chat e pulso"],
    ["Pico do mês", number.format(load.peakViewersThisMonth), "espectadores no mesmo minuto"],
    [
      "Minutos entregues no mês",
      number.format(load.viewerMinutesThisMonth),
      load.limits.monthlyViewerMinutesBudget > 0 ? `orçamento ${number.format(load.limits.monthlyViewerMinutesBudget)}` : "sem orçamento configurado",
    ],
  ];
  return (
    <Card as="div" className="flex flex-col gap-3" aria-label="Carga e consumo das lives" role="region">
      <h2 className="text-lg font-semibold">Carga e consumo</h2>
      {load.alerts.map((alert) => (
        <p key={alert.metric} role="alert" className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${alert.level === "critical" ? "bg-danger/10 text-danger" : "bg-surface-2"}`}>
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>{alert.level === "critical" ? "Acima do limite: " : "Perto do limite: "}</strong>
            {alert.message}
          </span>
        </p>
      ))}
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-xl bg-surface-2 p-3">
            <dt className="text-muted">{label}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
            {hint && <dd className="text-xs text-muted">{hint}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}
