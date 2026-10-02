import { randomBytes, randomUUID } from "node:crypto";
import type { Result, UnauthorizedError } from "@/shared/kernel";
import type { ProviderEvent, ProvisionedStream, StreamingProvider } from "../domain/streaming-provider";
import { MUX_INGEST_URL } from "./mux-streaming-provider";
import { verifyMuxStyleWebhook } from "./mux-webhook-format";

/** Stream HLS pública de teste (do próprio Mux), para o player funcionar sem conta. */
export const FAKE_HLS_URL = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

/**
 * Provedor simulado para desenvolvimento e E2E: gera a chave localmente, não transmite nada e toca uma
 * stream HLS pública de teste. Webhooks no mesmo formato do Mux, assinados com LIVE_FAKE_WEBHOOK_SECRET
 * (simule com `signWebhook`). Usado quando MUX_TOKEN_ID não está configurado.
 */
export class FakeStreamingProvider implements StreamingProvider {
  readonly name = "fake";
  // Mesmo servidor do Mux, para a tela de instruções ser idêntica; o portal avisa que é simulado.
  readonly ingestUrl = MUX_INGEST_URL;

  constructor(
    private readonly webhookSecret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createStream(): Promise<ProvisionedStream> {
    const id = randomUUID();
    return { providerStreamId: `fake-${id}`, streamKey: newKey(), playbackId: `fake-${id}` };
  }

  async resetStreamKey(): Promise<{ streamKey: string }> {
    return { streamKey: newKey() };
  }

  async disable(): Promise<void> {}

  async enable(): Promise<void> {}

  playbackUrl(): string {
    return FAKE_HLS_URL;
  }

  verifyWebhook(rawBody: string, headers: Headers): Result<ProviderEvent[], UnauthorizedError> {
    return verifyMuxStyleWebhook(this.webhookSecret, rawBody, headers, this.now());
  }
}

const newKey = () => randomBytes(24).toString("base64url");
