"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  title: string;
  /** Primeira vez que o vídeo começa a tocar (ex.: registrar live_view). */
  onPlaying?: () => void;
  /** Erro irrecuperável do player (rede, stream indisponível). */
  onError?: () => void;
};

/**
 * Player HLS. Safari/iOS (e navegadores com HLS nativo) tocam direto no <video>; nos demais, o hls.js
 * (Apache-2.0) é baixado SÓ aqui, sob demanda, com bitrate adaptativo e modo de baixa latência.
 * Sempre começa MUDO (RNF16) e com `playsInline` (não abre em tela cheia no iPhone).
 */
export default function HlsPlayer({ src, title, onPlaying, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onPlaying, onError });
  useEffect(() => {
    callbacks.current = { onPlaying, onError };
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let destroyed = false;
    let cleanup = () => {};
    const fail = () => {
      if (!destroyed) callbacks.current.onError?.();
    };

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("error", fail);
      cleanup = () => {
        video.removeEventListener("error", fail);
        video.removeAttribute("src");
        video.load();
      };
    } else {
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) return fail();
          const hls = new Hls({ lowLatencyMode: true, enableWorker: true, capLevelToPlayerSize: true });
          let recovered = false;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            // Uma tentativa de recuperar erro de mídia (decodificação); o resto vira "indisponível".
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
              recovered = true;
              hls.recoverMediaError();
              return;
            }
            fail();
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          cleanup = () => hls.destroy();
        })
        .catch(fail);
    }

    return () => {
      destroyed = true;
      cleanup();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      title={title}
      aria-label={title}
      className="aspect-video w-full rounded-2xl bg-black object-contain"
      muted
      autoPlay
      playsInline
      controls
      preload="none"
      onPlaying={() => callbacks.current.onPlaying?.()}
    />
  );
}
