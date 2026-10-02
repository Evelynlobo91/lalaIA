"use client";

import { useEffect } from "react";

type Props = { kind?: "view" | "live_view"; entityType: "place" | "event" | "live"; entityId: string };

/**
 * Registra uma visualização ao abrir a tela (RF25). Não renderiza nada e não atrasa a página:
 * usa `sendBeacon` (sobrevive à troca de página). Conta uma vez por aba, para recarregar não inflar o número.
 */
export function TrackView({ kind = "view", entityType, entityId }: Props) {
  useEffect(() => {
    // Consentimento (#25): "métricas de uso" desligadas neste navegador → não envia nada.
    if (/(?:^|;\s*)lalaia-analytics=0(?:;|$)/.test(document.cookie)) return;
    const key = `lalaia:track:${kind}:${entityType}:${entityId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Sem sessionStorage (modo privado/bloqueado): registra assim mesmo.
    }
    const body = JSON.stringify({ kind, entityType, entityId });
    const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/analytics/track", new Blob([body], { type: "application/json" }));
    if (!sent) {
      void fetch("/api/analytics/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  }, [kind, entityType, entityId]);

  return null;
}
