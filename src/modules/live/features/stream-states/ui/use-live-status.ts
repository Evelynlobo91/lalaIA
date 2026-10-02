"use client";

import { useEffect, useState } from "react";
import { LIVE_STATUS_POLL_MS } from "../stream-states.schema";
import type { LiveStatusView } from "../stream-states.use-case";
import { pollWhileVisible } from "./poll-while-visible";

/**
 * Status da live atualizado sem recarregar a página (RNF20). Na POC: polling leve de
 * GET /api/live/status, SÓ com a aba visível (aba em segundo plano não consulta; ao voltar, consulta na hora).
 * Evolução documentada: Supabase Realtime no lugar do polling, mantendo este hook como fachada.
 */
export function useLiveStatus(entityType: "place" | "event", entityId: string, initial: LiveStatusView, intervalMs = LIVE_STATUS_POLL_MS): LiveStatusView {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    const url = `/api/live/status?${new URLSearchParams({ entityType, entityId })}`;
    return pollWhileVisible(async (signal) => {
      const response = await fetch(url, { cache: "no-store", signal });
      if (!response.ok) return;
      const next = (await response.json()) as LiveStatusView;
      // Nada mudou: mantém o objeto (o player não é remontado).
      setStatus((current) => (sameStatus(current, next) ? current : next));
    }, intervalMs);
  }, [entityType, entityId, intervalMs]);

  return status;
}

function sameStatus(a: LiveStatusView, b: LiveStatusView): boolean {
  return (Object.keys(b) as Array<keyof LiveStatusView>).every((k) => a[k] === b[k]);
}
