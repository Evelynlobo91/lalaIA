import { formatDateTime } from "@/shared/time/joinville-time";
import { stageLabel } from "../../../domain/lead";
import type { StageChangeView } from "../pipeline.use-cases";

/** Histórico de etapas do lead (#148), do mais recente para o mais antigo. */
export function LeadHistory({ changes }: { changes: StageChangeView[] }) {
  if (changes.length === 0) return <p className="text-sm text-muted">Este lead ainda não mudou de etapa.</p>;
  return (
    <ol className="flex flex-col gap-3" aria-label="Histórico de etapas">
      {changes.map((change, index) => (
        <li key={index} className="rounded-xl border border-border px-3 py-2 text-sm">
          <p className="font-medium">
            {stageLabel(change.from)} → {stageLabel(change.to)}
          </p>
          <p className="text-muted">
            {change.changedByName} · {formatDateTime(change.changedAt)}
          </p>
          {change.reason && <p>Motivo: {change.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
