"use client";

import { useEffect, useState } from "react";
import { LIVE_STATUS_POLL_MS } from "../stream-states.schema";
import type { LiveStatusView } from "../stream-states.use-case";

/**
 * Status da live atualizado sem recarregar a página (RNF20). Na POC: polling leve de
 * GET /api/live/status, SÓ com a aba visível (aba em segundo plano não consulta; ao voltar, consulta na hora).
 * Evolução documentada: Supabase Realtime no lugar do polling, mantendo este hook como fachada.
 */
export function useLiveStatus(entityType: "place" | "event", entityId: string, initial: LiveStatusView, intervalMs = LIVE_STATUS_POLL_MS): LiveStatusView {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;
    const url = `/api/live/status?${new URLSearchParams({ entityType, entityId })}`;

    async function poll() {
      if (stopped || document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const next = (await response.json()) as LiveStatusView;
          // Mesmo status e mesma URL: mantém o objeto (o player não é remontado).
          setStatus((current) => (current.status === next.status && current.playbackUrl === next.playbackUrl && current.streamId === next.streamId ? current : next));
        }
      } catch {
        // Falha de rede: mantém o último estado e tenta no próximo ciclo.
      }
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(poll, intervalMs);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void poll();
      else clearTimeout(timer);
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [entityType, entityId, intervalMs]);

  return status;
}
