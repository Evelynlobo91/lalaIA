import { z } from "zod";
import { UnauthorizedError, err, ok, type Result } from "@/shared/kernel";
import type { ProviderEvent, ProviderEventKind } from "../domain/streaming-provider";
import { SIGNATURE_HEADER, verifyWebhookSignature } from "./webhook-signature";

// Envelope dos webhooks do Mux (https://docs.mux.com/core/listen-for-webhooks). O adaptador fake
// usa o mesmo formato, para que o E2E exercite o mesmo caminho de código.
const muxEventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  created_at: z.string().max(64).optional(),
  data: z.object({ id: z.string().min(1).max(200) }).loose().optional(),
});

// Map (e não objeto literal): um `type` como "constructor" não pode casar com o protótipo.
const kindByType = new Map<string, ProviderEventKind>(Object.entries({
  "video.live_stream.connected": "connected",
  "video.live_stream.active": "active",
  "video.live_stream.disconnected": "disconnected",
  "video.live_stream.idle": "idle",
  "video.live_stream.enabled": "enabled",
  "video.live_stream.disabled": "disabled",
} satisfies Record<string, ProviderEventKind>));

const invalidSignature = () => err(new UnauthorizedError("Assinatura do webhook inválida."));

/**
 * Assinatura válida → eventos normalizados. Tipos que não interessam (assets, uploads...) viram
 * lista vazia: respondemos 200 e o provedor não reenvia.
 */
export function verifyMuxStyleWebhook(secret: string, rawBody: string, headers: Headers, now: Date = new Date()): Result<ProviderEvent[], UnauthorizedError> {
  if (!verifyWebhookSignature(secret, rawBody, headers.get(SIGNATURE_HEADER), now)) return invalidSignature();

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return invalidSignature();
  }
  const parsed = muxEventSchema.safeParse(json);
  if (!parsed.success) return invalidSignature();

  const event = parsed.data;
  const kind = kindByType.get(event.type);
  if (!kind || !event.data) return ok([]);
  const createdAt = event.created_at ? new Date(event.created_at) : null;
  const occurredAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : now;
  return ok([{ eventId: event.id, providerStreamId: event.data.id, kind, occurredAt }]);
}
