"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Intervalo de atualização do feed ("começou há 25 min", quem abriu/fechou, lives). */
export const FEED_REFRESH_SECONDS = 60;

/**
 * Atualização em tempo real do feed: re-renderiza os Server Components a cada minuto, só com a aba
 * visível (e na hora em que a pessoa volta para a aba). Quando o módulo Live existir, o status das
 * lives pode chegar por Supabase Realtime e disparar o mesmo `router.refresh()` na hora.
 */
export function FeedAutoRefresh({ seconds = FEED_REFRESH_SECONDS }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, seconds]);

  return null;
}
