import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { StreamStatus, StreamTarget } from "../../domain/stream";
import type { GetLivePlayback, LivePlayback } from "../player/player.use-case";

/**
 * Resposta do GET /api/live/status. `none` = o lugar/evento não tem transmissão. `note` (situação atual) e
 * `liveSince` (ISO, desde quando está no ar) também se atualizam sem recarregar (#53).
 */
export type LiveStatusView = { status: StreamStatus | "none"; streamId: string | null; playbackUrl: string | null; note: string | null; liveSince: string | null };

export const NO_STREAM: LiveStatusView = { status: "none", streamId: null, playbackUrl: null, note: null, liveSince: null };

/** O que a página recebe (e o polling devolve), a partir da leitura pública da transmissão. */
export function liveStatusView(playback: LivePlayback | null): LiveStatusView {
  if (!playback) return NO_STREAM;
  return { status: playback.status, streamId: playback.streamId, playbackUrl: playback.playbackUrl, note: playback.note, liveSince: playback.liveSince?.toISOString() ?? null };
}

/** RNF20 — Status atual da live de um lugar/evento, para a página trocar de estado sem recarregar. */
export class GetLiveStatus {
  constructor(private readonly playback: Pick<GetLivePlayback, "execute">) {}

  async execute(target: StreamTarget): Promise<Result<LiveStatusView, DomainError>> {
    return ok(liveStatusView(await this.playback.execute(target)));
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
