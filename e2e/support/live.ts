import { createHmac, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { APIRequestContext } from "@playwright/test";

/**
 * Segredo dos webhooks simulados (provedor fake da Live). No CI vem do ambiente; localmente, do
 * `.env.local` (o mesmo que o `next start` lê).
 */
function webhookSecret(): string {
  if (!process.env.LIVE_FAKE_WEBHOOK_SECRET && existsSync(".env.local")) process.loadEnvFile(".env.local");
  const secret = process.env.LIVE_FAKE_WEBHOOK_SECRET;
  if (!secret) throw new Error("LIVE_FAKE_WEBHOOK_SECRET ausente (veja .env.example e docs/live.md).");
  return secret;
}

export type LiveWebhookType = "video.live_stream.active" | "video.live_stream.idle" | "video.live_stream.connected" | "video.live_stream.disconnected";

/** Corpo no formato do Mux e assinatura `mux-signature: t=..,v1=..` com o segredo do provedor simulado. */
export function signedLiveWebhook(providerStreamId: string, type: LiveWebhookType, opts: { eventId?: string; secret?: string } = {}) {
  const body = JSON.stringify({
    type,
    id: opts.eventId ?? randomUUID(),
    created_at: new Date().toISOString(),
    object: { type: "live_stream", id: providerStreamId },
    data: { id: providerStreamId },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", opts.secret ?? webhookSecret()).update(`${t}.${body}`).digest("hex");
  return { body, headers: { "content-type": "application/json", "mux-signature": `t=${t},v1=${v1}` } };
}

/** Simula o provedor avisando que a live entrou/saiu do ar. */
export async function sendLiveWebhook(request: APIRequestContext, providerStreamId: string, type: LiveWebhookType, opts: { eventId?: string; secret?: string } = {}) {
  const { body, headers } = signedLiveWebhook(providerStreamId, type, opts);
  return request.post("/api/live/webhooks", { data: body, headers });
}
