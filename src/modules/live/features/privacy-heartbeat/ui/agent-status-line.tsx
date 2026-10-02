import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { formatDateTime } from "@/shared/time/joinville-time";
import type { AgentStatusView } from "../privacy-heartbeat.use-case";

/**
 * Situação do agente de borrão de rostos (#198) numa transmissão. `live`: com a transmissão no ar, agente sem
 * sinal ou desligado vira alerta.
 */
export function AgentStatusLine({ agent, live, label }: { agent: AgentStatusView; live: boolean; label: string }) {
  const name = `Agente de borrão de ${label}`;
  if (agent.status === "protected") {
    return (
      <p className="flex items-start gap-1.5 text-sm" aria-label={name}>
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          Agente de borrão ativo: {agent.blurMode === "full" ? "quadro inteiro desfocado (detector em recuperação)" : "rostos desfocados"}
          {agent.fps !== null && <span className="text-muted"> · {agent.fps} fps</span>}
        </span>
      </p>
    );
  }
  if (agent.status === "none") {
    return (
      <p className="flex items-start gap-1.5 text-sm text-muted" aria-label={name}>
        <ShieldQuestion aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>Agente de borrão não conectado. Sem ele, vale o que você aceitou nas diretrizes de privacidade.</span>
      </p>
    );
  }
  return (
    <p className={`flex items-start gap-1.5 text-sm ${live ? "text-danger" : "text-muted"}`} role={live ? "alert" : undefined} aria-label={name}>
      <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        {agent.status === "off" ? "O agente avisou que o modo privacidade está desligado: a transmissão foi pausada." : "Agente de borrão sem sinal"}
        {agent.status === "stale" && agent.lastSeenAt && ` desde ${formatDateTime(agent.lastSeenAt)}.`}
        {agent.status === "stale" && live && " Confira a caixinha ou o notebook que faz o borrão."}
      </span>
    </p>
  );
}
