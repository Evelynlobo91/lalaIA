"use client";

import { CalendarDays, Clock, MapPin, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { formatTime } from "@/shared/time/joinville-time";
import type { LiveStatusView } from "../../stream-states/stream-states.use-case";
import { liveForLabel } from "../stream-context.use-case";

/** Evento, lugar e horário (do servidor) para mostrar junto do player. */
export type StreamContextInfo = { entityType: "place" | "event"; title: string; subtitle: string | null; whenLabel: string | null };

/**
 * RF21 — Contexto da transmissão junto do player: evento, lugar, horário, há quanto tempo está ao vivo e a
 * situação atual do parceiro. Situação e início chegam pelo mesmo polling do status (#51).
 * `renderedAt` vem do servidor: o primeiro render é igual no servidor e no navegador (sem erro de hidratação);
 * depois o "há X min" se atualiza a cada minuto.
 */
export function StreamContextLine({ info, status, renderedAt }: { info: StreamContextInfo | null; status: LiveStatusView; renderedAt: number }) {
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const since = status.status === "live" && status.liveSince ? new Date(status.liveSince) : null;
  if (!info && !since && !status.note) return null;

  return (
    <div className="flex flex-col gap-1 text-sm">
      {info && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          {info.entityType === "event" ? (
            <span className="inline-flex items-center gap-1 font-medium text-fg">
              <CalendarDays aria-hidden className="size-4" /> {info.title}
            </span>
          ) : null}
          {(info.entityType === "place" ? info.title : info.subtitle) && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {info.entityType === "place" ? [info.title, info.subtitle].filter(Boolean).join(" · ") : info.subtitle}
            </span>
          )}
          {info.whenLabel && <span>{info.whenLabel}</span>}
        </p>
      )}
      {since && (
        <p className="inline-flex items-center gap-1 text-muted">
          <Clock aria-hidden className="size-4" />
          Ao vivo {liveForLabel(since, new Date(now))} <span>(desde {formatTime(since)})</span>
        </p>
      )}
      {status.note && (
        <p className="inline-flex items-start gap-1">
          <MessageSquareText aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Agora:</span> {status.note}
          </span>
        </p>
      )}
    </div>
  );
}
