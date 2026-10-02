import type { PublicStreamReader, StreamEntityType, StreamStatus, StreamTarget } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";
import { ACTIVE_STREAMS_MAX } from "./player.schema";

/** O que o público vê de uma transmissão. A URL HLS só sai quando está ao vivo (pausada/encerrada some). */
export type LivePlayback = { streamId: string; status: StreamStatus; playbackUrl: string | null };

/** RF19 — Live de um lugar/evento para o player (null se não houver transmissão). Nunca expõe a chave. */
export class GetLivePlayback {
  constructor(
    private readonly streams: Pick<PublicStreamReader, "findByTarget">,
    private readonly provider: () => StreamingProvider,
  ) {}

  async execute(target: StreamTarget): Promise<LivePlayback | null> {
    const stream = await this.streams.findByTarget(target);
    if (!stream) return null;
    return {
      streamId: stream.id,
      status: stream.status,
      playbackUrl: stream.status === "live" ? this.provider().playbackUrl(stream.playbackId) : null,
    };
  }
}

export type ActiveStream = { streamId: string; entityType: StreamEntityType; entityId: string };

/** Transmissões ao vivo agora (para Recomendação e Mapa), das mais recentes para as mais antigas. */
export class ListActiveStreams {
  constructor(private readonly streams: Pick<PublicStreamReader, "listLive">) {}

  async execute(limit = ACTIVE_STREAMS_MAX): Promise<ActiveStream[]> {
    const live = await this.streams.listLive(Math.min(Math.max(1, Math.trunc(limit)), ACTIVE_STREAMS_MAX));
    return live.map((s) => ({ streamId: s.id, entityType: s.entityType, entityId: s.entityId }));
  }
}
