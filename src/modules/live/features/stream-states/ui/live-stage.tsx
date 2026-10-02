"use client";

import { CircleSlash, PauseCircle, RadioTower, WifiOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { Button, LiveBadge } from "@/shared/ui";
import { liveViewState, type LiveStatusView, type LiveViewKind } from "../stream-states.use-case";
import { useLiveStatus } from "./use-live-status";
import { StreamContextLine, type StreamContextInfo } from "../../stream-context/ui/stream-context-line";
import { PublicLiveNotice } from "../../privacy/ui/public-live-notice";
import { CtaOverlay } from "../../cta-overlay/ui/cta-overlay";
import { LiveChat } from "../../chat-feed/ui/live-chat";
import { FloatingReactions, ReactionBar } from "../../react-to-live/ui/reaction-bar";
import { useLivePulse } from "../../react-to-live/ui/use-live-pulse";

// O player (e o hls.js, quando preciso) só é baixado quando a live está no ar: não pesa a página.
const HlsPlayer = dynamic(() => import("../../player/ui/hls-player"), {
  ssr: false,
  loading: () => <div aria-hidden className="aspect-video w-full animate-pulse rounded-2xl bg-surface-2" />,
});

const icons: Partial<Record<LiveViewKind, ReactNode>> = {
  waiting: <RadioTower aria-hidden className="size-6" />,
  paused: <PauseCircle aria-hidden className="size-6" />,
  ended: <CircleSlash aria-hidden className="size-6" />,
  unavailable: <WifiOff aria-hidden className="size-6" />,
};

type Props = {
  entityType: "place" | "event";
  entityId: string;
  initial: LiveStatusView;
  /** Nome do lugar/evento (título acessível do vídeo). */
  title: string;
  /** Renderizado quando o vídeo começa a tocar (ex.: TrackView de live_view, do módulo analytics). */
  onWatch?: ReactNode;
  /** Evento, lugar e horário (#53), mostrados junto do player com a situação atual e há quanto tempo está no ar. */
  context?: StreamContextInfo | null;
  /** Hora do render no servidor (ms), para o "há X min" não divergir na hidratação. */
  renderedAt?: number;
  /** Chat da live (#95): presente quando o plano do anfitrião tem chat. `viewer` null = visitante (só lê). */
  chat?: { viewer: { name: string } | null; loginHref: string } | null;
};

/**
 * Live na página do lugar/evento com estados claros (RNF20): aguardando sinal, ao vivo, pausada,
 * encerrada e indisponível (erro do player). Troca de estado sozinha, sem recarregar a página.
 */
export function LiveStage({ entityType, entityId, initial, title, onWatch, context = null, renderedAt = 0, chat = null }: Props) {
  const status = useLiveStatus(entityType, entityId, initial);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [watching, setWatching] = useState(false);

  // O erro vale para a URL que falhou: se a live voltar com outra URL, tenta de novo sozinho.
  const view = liveViewState(status.status, failedUrl !== null && failedUrl === status.playbackUrl);
  // Pulso (#189, #191): só com a live no ar e o recurso no plano do anfitrião (mesma condição do chat).
  const engagement = useLivePulse(chat && view.kind === "live" ? status.streamId : null, Boolean(chat?.viewer));
  if (view.kind === "hidden") return null;

  return (
    <section aria-label="Transmissão ao vivo" className="flex flex-col gap-2">
      {view.kind === "live" && status.playbackUrl ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge />
            <span className="text-sm text-muted">{view.message}</span>
          </div>
          <div className="relative">
            <HlsPlayer
              key={`${status.playbackUrl}#${attempt}`}
              src={status.playbackUrl}
              title={`Ao vivo: ${title}`}
              onPlaying={() => setWatching(true)}
              onError={() => setFailedUrl(status.playbackUrl)}
            />
            {chat && <FloatingReactions floats={engagement.floats} />}
            <CtaOverlay cta={status.cta} entityType={entityType} entityId={entityId} />
          </div>
          {chat && (
            <ReactionBar
              pulse={engagement.pulse}
              liked={engagement.liked}
              canReact={chat.viewer !== null}
              loginHref={chat.loginHref}
              notice={engagement.notice}
              onLike={() => void engagement.toggleLike()}
              onReact={engagement.react}
              onVisitorTap={() => engagement.setNotice("Entre para curtir e reagir.")}
            />
          )}
          <PublicLiveNotice />
        </>
      ) : (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
          {icons[view.kind]}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-semibold">{view.title}</p>
            <p className="text-sm text-muted">{view.message}</p>
            {view.kind === "unavailable" && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-1 self-start"
                onClick={() => {
                  setFailedUrl(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Tentar de novo
              </Button>
            )}
          </div>
        </div>
      )}
      {view.kind !== "ended" && <StreamContextLine info={context} status={status} renderedAt={renderedAt} />}
      {chat && status.streamId && view.kind === "live" && <LiveChat streamId={status.streamId} viewer={chat.viewer} loginHref={chat.loginHref} likedMessageIds={engagement.likedMessageIds} />}
      {watching && onWatch}
    </section>
  );
}
