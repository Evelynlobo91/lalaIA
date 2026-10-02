import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { StreamStatus, StreamTarget } from "../../domain/stream";
import type { ActiveCtaView, GetActiveCta } from "../active-cta/active-cta.use-case";
import type { GetLivePlayback, LivePlayback } from "../player/player.use-case";

/**
 * Resposta do GET /api/live/status. `none` = o lugar/evento não tem transmissão. `note` (situação atual) e
 * `liveSince` (ISO, desde quando está no ar) também se atualizam sem recarregar (#53). `cta`: a chamada do
 * anfitrião que está valendo agora (#93), só com a live ao vivo.
 */
export type LiveStatusView = { status: StreamStatus | "none"; streamId: string | null; playbackUrl: string | null; note: string | null; liveSince: string | null; cta: ActiveCtaView | null; /** O agente de borrão está protegendo agora (#198). */ facesBlurred: boolean };

export const NO_STREAM: LiveStatusView = { status: "none", streamId: null, playbackUrl: null, note: null, liveSince: null, cta: null, facesBlurred: false };

/** O que a página recebe (e o polling devolve), a partir da leitura pública da transmissão. */
export function liveStatusView(playback: LivePlayback | null, cta: ActiveCtaView | null = null, facesBlurred = false): LiveStatusView {
  if (!playback) return NO_STREAM;
  return { status: playback.status, streamId: playback.streamId, playbackUrl: playback.playbackUrl, note: playback.note, liveSince: playback.liveSince?.toISOString() ?? null, cta: playback.status === "live" ? cta : null, facesBlurred: playback.status === "live" && facesBlurred };
}

/** RNF20 — Status atual da live de um lugar/evento, para a página trocar de estado sem recarregar. */
export class GetLiveStatus {
  constructor(
    private readonly playback: Pick<GetLivePlayback, "execute">,
    private readonly activeCta?: Pick<GetActiveCta, "execute">,
    private readonly agent?: { isProtected(streamId: string): Promise<boolean> },
  ) {}

  async execute(target: StreamTarget): Promise<Result<LiveStatusView, DomainError>> {
    const playback = await this.playback.execute(target);
    const live = playback?.status === "live";
    const [cta, facesBlurred] = await Promise.all([this.activeCta?.execute(playback) ?? null, live && this.agent ? this.agent.isProtected(playback.streamId).catch(() => false) : false]);
    return ok(liveStatusView(playback, cta, facesBlurred));
  }
}

export type LiveViewKind = "hidden" | "waiting" | "live" | "paused" | "ended" | "unavailable";
export type LiveViewState = { kind: LiveViewKind; title: string; message: string };

/**
 * O que a página mostra para cada estado (mensagens claras, RNF20). Erro do player tem prioridade sobre
 * "ao vivo": a live está no ar, mas este aparelho não conseguiu tocar.
 */
export function liveViewState(status: LiveStatusView["status"], playerFailed: boolean): LiveViewState {
  switch (status) {
    case "live":
      return playerFailed
        ? { kind: "unavailable", title: "Transmissão indisponível", message: "Não conseguimos carregar o vídeo agora. Verifique a conexão e tente de novo." }
        : { kind: "live", title: "Ao vivo", message: "Sem áudio por padrão: toque no alto-falante para ouvir." };
    case "waiting":
      return { kind: "waiting", title: "Aguardando sinal", message: "A transmissão começa em instantes. Esta área se atualiza sozinha." };
    case "paused":
      return { kind: "paused", title: "Transmissão pausada", message: "O responsável pausou a live. Ela volta aqui assim que for retomada." };
    case "ended":
      return { kind: "ended", title: "Transmissão encerrada", message: "A live terminou. Volte mais tarde para ver o ambiente de novo." };
    default:
      return { kind: "hidden", title: "", message: "" };
  }
}
