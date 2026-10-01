import { CalendarDays, MapPin, Radio } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, LiveBadge } from "@/shared/ui";
import { STATUS_LABELS, type StreamStatus } from "../../../domain/stream";
import type { LiveTargetView } from "../stream-key.use-case";
import { ProvisionStreamButton } from "./provision-stream-button";
import { StreamControls } from "../../stream-control/ui/stream-controls";
import { StreamKeyField } from "./stream-key-field";
import { StreamNoteForm } from "../../stream-context/ui/stream-note-form";

export function StreamStatusBadge({ status }: { status: StreamStatus }) {
  if (status === "live") return <LiveBadge />;
  return <Badge variant={status === "ended" ? "danger" : status === "paused" ? "warning" : "neutral"}>{STATUS_LABELS[status]}</Badge>;
}

/** Lugares e eventos do parceiro, cada um com a sua transmissão (ou o botão para gerar a chave). */
export function LiveTargetsList({ targets }: { targets: LiveTargetView[] }) {
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
                <StreamControls streamId={t.stream.id} status={t.stream.status} label={t.label} />
                {t.stream.status !== "ended" && <StreamNoteForm streamId={t.stream.id} note={t.stream.note} label={t.label} />}
                <StreamKeyField streamId={t.stream.id} />
              </>
            ) : (
              <ProvisionStreamButton entityType={t.entityType} entityId={t.entityId} label={t.label} />
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
