"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { LiveBadge } from "@/shared/ui";
import type { LivePlayback } from "../player.use-case";

// O player (e o hls.js, quando preciso) só é baixado quando há live no ar: não pesa a página.
const HlsPlayer = dynamic(() => import("./hls-player"), {
  ssr: false,
  loading: () => <div aria-hidden className="aspect-video w-full animate-pulse rounded-2xl bg-surface-2" />,
});

type Props = {
  playback: LivePlayback;
  /** Nome do lugar/evento (título acessível do vídeo). */
  title: string;
  /** Renderizado quando o vídeo começa a tocar (ex.: TrackView de live_view, do módulo analytics). */
  onWatch?: ReactNode;
};

/** Live na página do lugar/evento (RF19): player mudo, com selo "Ao vivo". */
export function LivePlayerPanel({ playback, title, onWatch }: Props) {
  const [watching, setWatching] = useState(false);
  if (playback.status !== "live" || !playback.playbackUrl) return null;

  return (
    <section aria-label="Transmissão ao vivo" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <LiveBadge />
        <span className="text-sm text-muted">Sem áudio por padrão: toque no alto-falante para ouvir.</span>
      </div>
      <HlsPlayer src={playback.playbackUrl} title={`Ao vivo: ${title}`} onPlaying={() => setWatching(true)} />
      {watching && onWatch}
    </section>
  );
}
