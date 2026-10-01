import { z } from "zod";
import type { ProviderEvent, ProvisionedStream, StreamingProvider } from "../domain/streaming-provider";
import type { Result, UnauthorizedError } from "@/shared/kernel";
import { verifyMuxStyleWebhook } from "./mux-webhook-format";

export const MUX_INGEST_URL = "rtmps://global-live.mux.com:443/app";
const API = "https://api.mux.com/video/v1/live-streams";
const TIMEOUT_MS = 10_000;

export type MuxConfig = { tokenId: string; tokenSecret: string; webhookSecret: string };

const createdSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    stream_key: z.string().min(16),
    playback_ids: z.array(z.object({ id: z.string().min(1), policy: z.string() })).min(1),
  }),
});
const keySchema = z.object({ data: z.object({ stream_key: z.string().min(16) }) });

/** Erro de comunicação com o Mux (sem o corpo da resposta, que pode conter dados da conta). */
export class MuxApiError extends Error {
  constructor(
    readonly status: number,
    operation: string,
  ) {
    super(`Mux respondeu ${status} em ${operation}.`);
    this.name = "MuxApiError";
  }
}

/** Adaptador real do Mux Video (REST via fetch, Basic auth com o Access Token). */
export class MuxStreamingProvider implements StreamingProvider {
  readonly name = "mux";
  readonly ingestUrl = MUX_INGEST_URL;
  private readonly authorization: string;

  constructor(
    private readonly config: MuxConfig,
    private readonly http: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.authorization = `Basic ${Buffer.from(`${config.tokenId}:${config.tokenSecret}`).toString("base64")}`;
  }

  async createStream(): Promise<ProvisionedStream> {
    // Sem gravação (new_asset_settings ausente): a live é do ambiente, não vira vídeo arquivado (privacidade).
    const body = await this.call("POST", "", "criar transmissão", {
      playback_policy: ["public"],
      latency_mode: "low",
      reconnect_window: 60,
    });
    const { data } = createdSchema.parse(body);
    const playback = data.playback_ids.find((p) => p.policy === "public") ?? data.playback_ids[0];
    return { providerStreamId: data.id, streamKey: data.stream_key, playbackId: playback.id };
  }

  async resetStreamKey(providerStreamId: string): Promise<{ streamKey: string }> {
    const body = await this.call("POST", `/${encodeURIComponent(providerStreamId)}/reset-stream-key`, "rotacionar chave");
    return { streamKey: keySchema.parse(body).data.stream_key };
  }

  async disable(providerStreamId: string): Promise<void> {
    await this.call("PUT", `/${encodeURIComponent(providerStreamId)}/disable`, "desativar transmissão");
  }

  async enable(providerStreamId: string): Promise<void> {
    await this.call("PUT", `/${encodeURIComponent(providerStreamId)}/enable`, "ativar transmissão");
  }

  playbackUrl(playbackId: string): string {
    return `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`;
  }

  verifyWebhook(rawBody: string, headers: Headers): Result<ProviderEvent[], UnauthorizedError> {
    return verifyMuxStyleWebhook(this.config.webhookSecret, rawBody, headers, this.now());
  }

  private async call(method: "POST" | "PUT", path: string, operation: string, payload?: unknown): Promise<unknown> {
    const response = await this.http(`${API}${path}`, {
      method,
      headers: { authorization: this.authorization, "content-type": "application/json", accept: "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new MuxApiError(response.status, operation);
    return response.json();
  }
}
