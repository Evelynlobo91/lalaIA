import { CalendarDays, MapPin, Megaphone, Radio, Users } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, LiveBadge } from "@/shared/ui";
import { STATUS_LABELS, type StreamStatus } from "../../../domain/stream";
import type { LiveTargetView } from "../stream-key.use-case";
import { ProvisionStreamButton } from "./provision-stream-button";
import { StreamControls } from "../../stream-control/ui/stream-controls";
import { StreamKeyField } from "./stream-key-field";
import { StreamNoteForm } from "../../stream-context/ui/stream-note-form";
import { StreamMetricsLine } from "../../stream-metrics/ui/stream-metrics-line";
import { ChatSettingsForm } from "../../moderate-chat/ui/chat-settings-form";
import type { StreamMetrics } from "../../stream-metrics/stream-metrics.use-case";

export function StreamStatusBadge({ status }: { status: StreamStatus }) {
  if (status === "live") return <LiveBadge />;
  return <Badge variant={status === "ended" ? "danger" : status === "paused" ? "warning" : "neutral"}>{STATUS_LABELS[status]}</Badge>;
}

/**
 * Lugares e eventos do parceiro, cada um com a sua transmissão (ou o botão para gerar a chave).
 * `metrics` (opcional, por id da transmissão): quantas vezes assistiram e acessos à página (#54).
 */
export function LiveTargetsList({
  targets,
  metrics = {},
  viewers = {},
  chat = {},
  canBroadcast = true,
}: {
  targets: LiveTargetView[];
  metrics?: Record<string, StreamMetrics>;
  /** Quantas abas estão assistindo agora, por id da transmissão (#191). */
  viewers?: Record<string, number>;
  /** Opções do chat por id da transmissão (#192); ausente quando o plano não tem chat. */
  chat?: Record<string, { chatEnabled: boolean; slowSeconds: number }>;
  /** false sem o aceite das diretrizes de privacidade (#55): gerar a chave e ativar ficam bloqueados. */
  canBroadcast?: boolean;
}) {
  if (targets.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="Nada para transmitir ainda"
        description="Reivindique um lugar em Meus lugares ou crie um evento para gerar a chave de transmissão."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Transmissões">
      {targets.map((t) => (
        <li key={`${t.entityType}:${t.entityId}`}>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {t.entityType === "place" ? <MapPin aria-hidden className="mt-0.5 size-5 shrink-0" /> : <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0" />}
                <div className="min-w-0">
                  <h3 className="font-semibold">{t.label}</h3>
                  <p className="text-sm text-muted">
                    {t.entityType === "place" ? "Lugar" : "Evento"} ·{" "}
                    <Link href={t.href} className="text-brand underline">
                      ver página pública
                    </Link>
                  </p>
                </div>
              </div>
              {t.stream && <StreamStatusBadge status={t.stream.status} />}
            </div>
            {t.stream ? (
              <>
                <StreamControls streamId={t.stream.id} status={t.stream.status} label={t.label} canActivate={canBroadcast} />
                {t.stream.status !== "ended" && <StreamNoteForm streamId={t.stream.id} note={t.stream.note} label={t.label} />}
                {t.stream.status === "live" && (
                  <p className="flex items-center gap-1.5 text-sm" aria-label={`Assistindo agora a ${t.label}`}>
                    <Users aria-hidden className="size-4" />
                    <span className="font-semibold">{viewers[t.stream.id] ?? 0}</span> assistindo agora
                  </p>
                )}
                {metrics[t.stream.id] && <StreamMetricsLine metrics={metrics[t.stream.id]!} label={t.label} />}
                {chat[t.stream.id] && <ChatSettingsForm streamId={t.stream.id} label={t.label} chatEnabled={chat[t.stream.id]!.chatEnabled} slowSeconds={chat[t.stream.id]!.slowSeconds} />}
                {t.stream.status !== "ended" && (
                  <Link href={`/parceiro/live/chamadas/${t.stream.id}`} className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-brand underline" aria-label={`Chamadas na live de ${t.label}`}>
                    <Megaphone aria-hidden className="size-4" /> Chamadas na live
                  </Link>
                )}
                <StreamKeyField streamId={t.stream.id} />
              </>
            ) : (
              <ProvisionStreamButton entityType={t.entityType} entityId={t.entityId} label={t.label} disabled={!canBroadcast} />
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
