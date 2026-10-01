import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FAKE_HLS_URL, FakeStreamingProvider } from "./fake-streaming-provider";
import { streamingProviderFrom } from "./live-config";
import { MuxApiError, MuxStreamingProvider } from "./mux-streaming-provider";
import { signWebhook, verifyWebhookSignature } from "./webhook-signature";

const MUX_SECRET = "segredo-do-webhook-mux-de-teste";
const FAKE_SECRET = "segredo-do-webhook-fake-com-mais-de-32-caracteres";
const now = new Date("2026-10-01T12:00:00Z");
const t = Math.floor(now.getTime() / 1000);

const event = (type = "video.live_stream.active", id = "evt-1") =>
  JSON.stringify({ type, id, created_at: "2026-10-01T11:59:58.123456Z", object: { type: "live_stream", id: "ls-1" }, data: { id: "ls-1", status: "active" } });

const headers = (signature: string) => new Headers({ "mux-signature": signature });
const manual = (secret: string, body: string, ts: number) => `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("assinatura do webhook (formato mux-signature)", () => {
  it("aceita a assinatura gerada no mesmo formato do Mux", () => {
    const body = event();
    expect(signWebhook(MUX_SECRET, body, now)).toBe(manual(MUX_SECRET, body, t));
    expect(verifyWebhookSignature(MUX_SECRET, body, manual(MUX_SECRET, body, t), now)).toBe(true);
  });

  it("recusa corpo adulterado, outro segredo, header ausente ou malformado", () => {
    const body = event();
    const good = manual(MUX_SECRET, body, t);
    expect(verifyWebhookSignature(MUX_SECRET, body.replace("active", "idle"), good, now)).toBe(false);
    expect(verifyWebhookSignature(MUX_SECRET, body, manual("outro-segredo", body, t), now)).toBe(false);
    expect(verifyWebhookSignature(MUX_SECRET, body, null, now)).toBe(false);
    for (const bad of ["", "v1=abc", `t=${t}`, `t=abc,v1=${"0".repeat(64)}`, `t=${t},v1=zz`]) {
      expect(verifyWebhookSignature(MUX_SECRET, body, bad, now)).toBe(false);
    }
  });

  it("recusa fora da tolerância de 5 minutos (replay), nos dois sentidos", () => {
    const body = event();
    expect(verifyWebhookSignature(MUX_SECRET, body, manual(MUX_SECRET, body, t - 299), now)).toBe(true);
    expect(verifyWebhookSignature(MUX_SECRET, body, manual(MUX_SECRET, body, t - 301), now)).toBe(false);
    expect(verifyWebhookSignature(MUX_SECRET, body, manual(MUX_SECRET, body, t + 301), now)).toBe(false);
  });

  it("aceita quando uma das assinaturas (troca de segredo) confere", () => {
    const body = event();
    const valid = manual(MUX_SECRET, body, t).split(",v1=")[1];
    expect(verifyWebhookSignature(MUX_SECRET, body, `t=${t},v1=${"a".repeat(64)},v1=${valid}`, now)).toBe(true);
  });
});

describe("MuxStreamingProvider", () => {
  const config = { tokenId: "token-id", tokenSecret: "token-secret", webhookSecret: MUX_SECRET };

  it("cria a live stream pela API REST com Basic auth, baixa latência e sem gravação", async () => {
    const http = vi.fn(async () => jsonResponse({ data: { id: "ls-1", stream_key: "sk-1234567890abcdef", playback_ids: [{ id: "pb-1", policy: "public" }] } }, 201));
    const mux = new MuxStreamingProvider(config, http as unknown as typeof fetch);
    await expect(mux.createStream()).resolves.toEqual({ providerStreamId: "ls-1", streamKey: "sk-1234567890abcdef", playbackId: "pb-1" });

    const [url, init] = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mux.com/video/v1/live-streams");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("token-id:token-secret").toString("base64")}`);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ playback_policy: ["public"], latency_mode: "low" });
    expect(body).not.toHaveProperty("new_asset_settings");
  });

  it("rotaciona a chave, desativa e reativa pelo id da live stream", async () => {
    const http = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => (url.endsWith("reset-stream-key") ? jsonResponse({ data: { stream_key: "sk-nova-1234567890ab" } }) : jsonResponse({ data: {} })));
    const mux = new MuxStreamingProvider(config, http as unknown as typeof fetch);
    await expect(mux.resetStreamKey("ls-1")).resolves.toEqual({ streamKey: "sk-nova-1234567890ab" });
    await mux.disable("ls-1");
    await mux.enable("ls-1");
    expect(http.mock.calls.map(([url, init]) => `${(init as RequestInit).method} ${url}`)).toEqual([
      "POST https://api.mux.com/video/v1/live-streams/ls-1/reset-stream-key",
      "PUT https://api.mux.com/video/v1/live-streams/ls-1/disable",
      "PUT https://api.mux.com/video/v1/live-streams/ls-1/enable",
    ]);
  });

  it("erro da API vira MuxApiError sem o corpo da resposta", async () => {
    const http = vi.fn(async () => jsonResponse({ error: { messages: ["detalhe interno da conta"] } }, 401));
    const mux = new MuxStreamingProvider(config, http as unknown as typeof fetch);
    const failure = mux.disable("ls-1");
    await expect(failure).rejects.toBeInstanceOf(MuxApiError);
    await expect(failure).rejects.not.toThrow(/detalhe interno/);
  });

  it("monta a URL HLS pública", () => {
    expect(new MuxStreamingProvider(config).playbackUrl("pb-1")).toBe("https://stream.mux.com/pb-1.m3u8");
  });

  it("verifica o webhook e normaliza o evento da live stream", () => {
    const mux = new MuxStreamingProvider(config, fetch, () => now);
    const body = event();
    const result = mux.verifyWebhook(body, headers(signWebhook(MUX_SECRET, body, now)));
    expect(result).toEqual({ ok: true, value: [{ eventId: "evt-1", providerStreamId: "ls-1", kind: "active", occurredAt: new Date("2026-10-01T11:59:58.123Z") }] });
  });

  it("assinatura inválida → erro 401; tipos que não interessam → lista vazia", () => {
    const mux = new MuxStreamingProvider(config, fetch, () => now);
    const body = event();
    const bad = mux.verifyWebhook(body, headers(signWebhook("outro", body, now)));
    expect(!bad.ok && bad.error.code).toBe("unauthorized");

    for (const type of ["video.asset.ready", "constructor", "__proto__"]) {
      const other = event(type);
      expect(mux.verifyWebhook(other, headers(signWebhook(MUX_SECRET, other, now)))).toEqual({ ok: true, value: [] });
    }
  });
});

describe("FakeStreamingProvider", () => {
  it("gera chaves locais diferentes e toca a stream HLS de teste", async () => {
    const fake = new FakeStreamingProvider(FAKE_SECRET);
    const a = await fake.createStream();
    const b = await fake.createStream();
    expect(a.providerStreamId).not.toBe(b.providerStreamId);
    expect(a.streamKey).not.toBe(b.streamKey);
    expect(a.streamKey.length).toBeGreaterThanOrEqual(32);
    expect((await fake.resetStreamKey()).streamKey).not.toBe(a.streamKey);
    expect(fake.playbackUrl()).toBe(FAKE_HLS_URL);
  });

  it("webhook assinado com LIVE_FAKE_WEBHOOK_SECRET no mesmo formato do Mux", () => {
    const fake = new FakeStreamingProvider(FAKE_SECRET, () => now);
    const body = event("video.live_stream.idle", "evt-2");
    expect(fake.verifyWebhook(body, headers(signWebhook(FAKE_SECRET, body, now)))).toMatchObject({ ok: true, value: [{ kind: "idle", eventId: "evt-2" }] });
    expect(fake.verifyWebhook(body, headers(signWebhook(MUX_SECRET, body, now))).ok).toBe(false);
  });
});

describe("escolha do provedor pelo ambiente", () => {
  it("com MUX_TOKEN_ID → Mux; exige o segredo e o segredo do webhook", () => {
    expect(streamingProviderFrom({ MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "s", MUX_WEBHOOK_SECRET: MUX_SECRET }).name).toBe("mux");
    expect(() => streamingProviderFrom({ MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "s" })).toThrow(/MUX_WEBHOOK_SECRET/);
    expect(() => streamingProviderFrom({ MUX_TOKEN_ID: "id", MUX_WEBHOOK_SECRET: MUX_SECRET })).toThrow(/MUX_TOKEN_SECRET/);
  });

  it("sem MUX_TOKEN_ID → simulado, que exige um segredo forte (sem valor padrão)", () => {
    expect(streamingProviderFrom({ LIVE_FAKE_WEBHOOK_SECRET: FAKE_SECRET }).name).toBe("fake");
    expect(() => streamingProviderFrom({})).toThrow(/LIVE_FAKE_WEBHOOK_SECRET/);
    expect(() => streamingProviderFrom({ LIVE_FAKE_WEBHOOK_SECRET: "curto" })).toThrow(/32 caracteres/);
  });
});
