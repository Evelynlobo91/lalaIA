import "server-only";
import { z } from "zod";
import type { StreamingProvider } from "../domain/streaming-provider";
import { FakeStreamingProvider } from "./fake-streaming-provider";
import { MuxStreamingProvider } from "./mux-streaming-provider";

// Escolha do provedor pelo ambiente: com MUX_TOKEN_ID → Mux; sem → fake (desenvolvimento/E2E).
// Segredos só no servidor e sem valor padrão no código, em nenhum ambiente.
const muxSchema = z.object({
  MUX_TOKEN_ID: z.string().min(1),
  MUX_TOKEN_SECRET: z.string().min(1, "MUX_TOKEN_SECRET é obrigatório com MUX_TOKEN_ID"),
  MUX_WEBHOOK_SECRET: z.string().min(16, "MUX_WEBHOOK_SECRET é obrigatório com MUX_TOKEN_ID (Settings → Webhooks no Mux)"),
});

const fakeSchema = z.object({
  LIVE_FAKE_WEBHOOK_SECRET: z.string().min(32, "LIVE_FAKE_WEBHOOK_SECRET precisa ter pelo menos 32 caracteres"),
});

export type LiveEnv = Record<string, string | undefined>;

/** Monta o provedor a partir do ambiente. Falha cedo, com mensagem clara (sem revelar valores). */
export function streamingProviderFrom(env: LiveEnv): StreamingProvider {
  if (env.MUX_TOKEN_ID) {
    const parsed = muxSchema.safeParse(env);
    if (!parsed.success) throw new Error(`Configuração do Mux inválida: ${messages(parsed.error)}. Veja .env.example e docs/live.md.`);
    const { MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET } = parsed.data;
    return new MuxStreamingProvider({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET, webhookSecret: MUX_WEBHOOK_SECRET });
  }
  const parsed = fakeSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Live sem provedor configurado: defina MUX_TOKEN_ID (Mux) ou LIVE_FAKE_WEBHOOK_SECRET (simulado). ${messages(parsed.error)}.`);
  }
  return new FakeStreamingProvider(parsed.data.LIVE_FAKE_WEBHOOK_SECRET);
}

// Nome da variável + regra (nunca o valor).
const messages = (error: z.ZodError) => error.issues.map((i) => `${i.path.join(".")} ausente ou inválida (${i.message})`).join("; ");
