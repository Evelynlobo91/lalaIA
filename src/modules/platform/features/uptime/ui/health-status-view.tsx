import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { Card } from "@/shared/ui";
import type { HealthReport } from "../../../domain/health";

const overall = {
  ok: { icon: CircleCheck, text: "Tudo funcionando", className: "text-success" },
  degraded: { icon: CircleAlert, text: "Funcionando com instabilidade", className: "text-warning" },
  down: { icon: CircleX, text: "Fora do ar", className: "text-danger" },
} as const;

const names: Record<string, string> = { banco: "Dados (lugares, eventos, missões)", autenticacao: "Login e cadastro" };

/** Página pública de status: situação geral + cada dependência, com ícone e texto (nunca só cor). */
export function HealthStatusView({ report }: { report: HealthReport }) {
  const o = overall[report.status];
  return (
    <div className="flex flex-col gap-4">
      <Card as="div" className="flex items-center gap-3">
        <o.icon aria-hidden className={`size-8 ${o.className}`} />
        <div>
          <p className="text-lg font-semibold">{o.text}</p>
          <p className="text-sm text-muted">Verificado agora · versão {report.version}</p>
        </div>
      </Card>
      <ul aria-label="Serviços" className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {report.checks.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-3">
            <span>{names[c.name] ?? c.name}</span>
            <span className="inline-flex items-center gap-1 text-sm">
              {c.status === "ok" ? <CircleCheck aria-hidden className="size-4 text-success" /> : <CircleX aria-hidden className="size-4 text-danger" />}
              {c.status === "ok" ? `Operando (${c.latencyMs} ms)` : "Com falha"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
