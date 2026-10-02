import type { Result, UnauthorizedError } from "@/shared/kernel";

/** O que o provedor informa por webhook, já normalizado (independe de Mux/Cloudflare). */
export type ProviderEventKind = "connected" | "active" | "disconnected" | "idle" | "enabled" | "disabled";

export type ProviderEvent = {
  /** Id único do evento no provedor (idempotência). */
  eventId: string;
  providerStreamId: string;
  kind: ProviderEventKind;
  occurredAt: Date;
};

export type ProvisionedStream = { providerStreamId: string; streamKey: string; playbackId: string };

/**
 * Porta do provedor de streaming (DIP). Trocar Mux por Cloudflare Stream = nova implementação
 * desta interface, sem mudar os casos de uso.
 */
export interface StreamingProvider {
  /** Nome gravado na transmissão ("mux", "fake"). */
  readonly name: string;
  /** Servidor de ingestão (RTMP/RTMPS) que o parceiro configura no OBS/Larix. */
  readonly ingestUrl: string;
  createStream(): Promise<ProvisionedStream>;
  /** Gera uma chave nova; a anterior para de funcionar. */
  resetStreamKey(providerStreamId: string): Promise<{ streamKey: string }>;
  /** Derruba a ingestão na hora e recusa novas conexões ("encerrar"). */
  disable(providerStreamId: string): Promise<void>;
  enable(providerStreamId: string): Promise<void>;
  /** URL HLS pública para o player. */
  playbackUrl(playbackId: string): string;
  /** Confere a assinatura e normaliza os eventos. Eventos de outros tipos (ex.: assets) viram lista vazia. */
  verifyWebhook(rawBody: string, headers: Headers): Result<ProviderEvent[], UnauthorizedError>;
}
