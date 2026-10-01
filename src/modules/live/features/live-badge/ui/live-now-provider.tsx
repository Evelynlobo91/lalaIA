"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LiveNowContext, liveNowKey } from "@/shared/ui";
import { pollWhileVisible } from "../../stream-states/ui/poll-while-visible";
import { LIVE_NOW_POLL_MS } from "../live-badge.schema";
import type { ActiveStreamsView } from "../live-badge.use-case";

/**
 * Fornece às listas e ao detalhe o conjunto de lugares/eventos ao vivo agora (`LiveNowContext`, de
 * shared/ui): os cards de places e events mostram o selo sem conhecer o módulo live. Começa com o que o
 * servidor já sabe (`initial`, chaves `tipo:id`) e se atualiza por polling leve de GET /api/live/active,
 * só com a aba visível. Evolução: Supabase Realtime (docs/live.md).
 */
export function LiveNowProvider({ initial, intervalMs = LIVE_NOW_POLL_MS, children }: { initial: string[]; intervalMs?: number; children: ReactNode }) {
  const [keys, setKeys] = useState<string[]>(initial);

  useEffect(
    () =>
      pollWhileVisible(async (signal) => {
        const response = await fetch("/api/live/active", { signal });
        if (!response.ok) return;
        const { streams } = (await response.json()) as ActiveStreamsView;
        const next = streams.map((s) => liveNowKey(s.entityType, s.entityId)).sort();
        setKeys((current) => (current.length === next.length && current.every((k, i) => k === next[i]) ? current : next));
      }, intervalMs),
    [intervalMs],
  );

  const value = useMemo(() => new Set(keys), [keys]);
  return <LiveNowContext.Provider value={value}>{children}</LiveNowContext.Provider>;
}
