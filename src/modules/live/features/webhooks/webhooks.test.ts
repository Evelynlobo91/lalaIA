import { describe, expect, it, vi } from "vitest";
import type { DomainEventPublisher } from "@/shared/events";
import { UnauthorizedError, err, ok } from "@/shared/kernel";
import { signalAfter, statusOf, type RecordedProviderEvent, type SignalState, type StreamLifecycleLog, type StreamRecord } from "../../domain/stream";
import type { ProviderEvent, StreamingProvider } from "../../domain/streaming-provider";
import { FakeStreamingProvider } from "../../infra/fake-streaming-provider";
import { signWebhook } from "../../infra/webhook-signature";
import { webhooksRoute } from "./webhooks.route";
import { HandleProviderWebhook } from "./webhooks.use-case";

const t0 = new Date("2026-10-01T12:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);

const stream = (patch: Partial<StreamRecord> = {}): StreamRecord => {
  const base: StreamRecord = {
    id: "s1",
    ownerId: "ana",
    entityType: "event",
    entityId: "e1",
    provider: "fake",
    providerStreamId: "ls-1",
    playbackId: "pb",
    control: "on",
    signal: "offline",
    status: "waiting",
    note: null,
    signalChangedAt: t0,
    createdAt: t0,
    ...patch,
  };
  return { ...base, status: statusOf(base.control, base.signal) };
};

/** Log em memória com a mesma semântica do Postgres: idempotente pelo id do evento. */
function memoryLog(initial: StreamRecord | null) {
  let current = initial;
  const seen = new Set<string>();
  const rows: Array<{ eventId: string; kind: string }> = [];
  const log: StreamLifecycleLog = {
    async recordProviderEvent(event, next): Promise<RecordedProviderEvent> {
      if (!current || current.providerStreamId !== event.providerStreamId) return { outcome: "unknown_stream" };
      if (seen.has(event.eventId)) return { outcome: "duplicate" };
      seen.add(event.eventId);
      rows.push({ eventId: event.eventId, kind: event.kind });
      const before = current;
      const signal: SignalState = next({ signal: before.signal, signalChangedAt: before.signalChangedAt });
      current = stream({ ...before, ...signal });
      return { outcome: "applied", before, after: current };
    },
  };
  return { log, rows, current: () => current };
}

function providerReturning(events: ProviderEvent[] | "invalid"): StreamingProvider {
  return {
    name: "fake",
    ingestUrl: "rtmps://x",
    createStream: vi.fn(),
    resetStreamKey: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    playbackUrl: () => "",
    verifyWebhook: () => (events === "invalid" ? err(new UnauthorizedError("Assinatura do webhook inválida.")) : ok(events)),
  };
}

const ev = (kind: ProviderEvent["kind"], eventId: string, seconds: number): ProviderEvent => ({ eventId, providerStreamId: "ls-1", kind, occurredAt: at(seconds) });

describe("signalAfter (regra do sinal)", () => {
  const offline: SignalState = { signal: "offline", signalChangedAt: t0 };
  it("active liga; idle, disconnected e disabled desligam; connected/enabled não mudam", () => {
    expect(signalAfter(offline, { kind: "active", occurredAt: at(5) })).toEqual({ signal: "live", signalChangedAt: at(5) });
    const live: SignalState = { signal: "live", signalChangedAt: at(5) };
    for (const kind of ["idle", "disconnected", "disabled"]) expect(signalAfter(live, { kind, occurredAt: at(9) }).signal).toBe("offline");
    for (const kind of ["connected", "enabled"]) expect(signalAfter(live, { kind, occurredAt: at(9) })).toBe(live);
  });

  it("evento atrasado (mais antigo que a última mudança) não muda o sinal", () => {
    const live: SignalState = { signal: "live", signalChangedAt: at(10) };
    expect(signalAfter(live, { kind: "idle", occurredAt: at(3) })).toBe(live);
  });
});

describe("HandleProviderWebhook (#48)", () => {
  it("grava, muda o status e publica StreamStatusChanged depois de gravar", async () => {
    const memory = memoryLog(stream());
    const publish = vi.fn<DomainEventPublisher["publish"]>(async () => {});
    const useCase = new HandleProviderWebhook(() => providerReturning([ev("active", "evt-1", 5)]), memory.log, { publish });
    const result = await useCase.execute("{}", new Headers());
    expect(result).toEqual({ ok: true, value: { received: 1, applied: 1, duplicates: 0, unknown: 0, invalid: 0 } });
    expect(memory.current()?.status).toBe("live");
    expect(publish).toHaveBeenCalledWith("live.StreamStatusChanged", { streamId: "s1", entityType: "event", entityId: "e1", status: "live" });
  });

  it("é idempotente: o mesmo evento reenviado não grava nem publica de novo", async () => {
    const memory = memoryLog(stream());
    const publish = vi.fn(async () => {});
    const useCase = new HandleProviderWebhook(() => providerReturning([ev("active", "evt-1", 5)]), memory.log, { publish });
    await useCase.execute("{}", new Headers());
    const again = await useCase.execute("{}", new Headers());
    expect(again.ok && again.value.duplicates).toBe(1);
    expect(memory.rows).toHaveLength(1);
    expect(publish).toHaveBeenCalledOnce();
  });

  it("evento sem mudança de status é registrado, mas não publica", async () => {
    const memory = memoryLog(stream());
    const publish = vi.fn(async () => {});
    await new HandleProviderWebhook(() => providerReturning([ev("connected", "evt-2", 5)]), memory.log, { publish }).execute("{}", new Headers());
    expect(memory.rows).toEqual([{ eventId: "evt-2", kind: "connected" }]);
    expect(publish).not.toHaveBeenCalled();
  });

  it("pausada pelo parceiro continua pausada quando o sinal chega (webhook não muda o controle)", async () => {
    const memory = memoryLog(stream({ control: "paused" }));
    const publish = vi.fn(async () => {});
    await new HandleProviderWebhook(() => providerReturning([ev("active", "evt-3", 5)]), memory.log, { publish }).execute("{}", new Headers());
    expect(memory.current()).toMatchObject({ signal: "live", status: "paused" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("assinatura inválida → erro (401), sem gravar", async () => {
    const memory = memoryLog(stream());
    const result = await new HandleProviderWebhook(() => providerReturning("invalid"), memory.log, { publish: vi.fn() }).execute("{}", new Headers());
    expect(!result.ok && result.error.code).toBe("unauthorized");
    expect(memory.rows).toHaveLength(0);
  });

  it("transmissão desconhecida é ignorada (200, sem reenvio do provedor)", async () => {
    const memory = memoryLog(null);
    const result = await new HandleProviderWebhook(() => providerReturning([ev("active", "evt-4", 5)]), memory.log, { publish: vi.fn() }).execute("{}", new Headers());
    expect(result.ok && result.value.unknown).toBe(1);
  });
});

describe("POST /api/live/webhooks (rota)", () => {
  const SECRET = "segredo-do-webhook-fake-com-mais-de-32-caracteres";
  const body = JSON.stringify({ type: "video.live_stream.active", id: "evt-rota", created_at: new Date().toISOString(), data: { id: "ls-1" } });
  const fresh = () => memoryLog(stream({ signalChangedAt: new Date(0) }));
  const route = (memory = fresh()) => webhooksRoute(() => new HandleProviderWebhook(() => new FakeStreamingProvider(SECRET), memory.log, { publish: vi.fn(async () => {}) }));
  const post = (raw: string, signature?: string) =>
    new Request("http://localhost/api/live/webhooks", { method: "POST", body: raw, headers: signature ? { "mux-signature": signature } : {} });

  it("assinatura válida sobre o corpo cru → 200 e status aplicado", async () => {
    const memory = fresh();
    const response = await route(memory)(post(body, signWebhook(SECRET, body)));
    expect(response.status).toBe(200);
    expect(memory.current()?.status).toBe("live");
  });

  it("assinatura inválida, ausente ou de outro corpo → 401", async () => {
    expect((await route()(post(body, signWebhook("outro-segredo-qualquer-com-32-caracteres", body)))).status).toBe(401);
    expect((await route()(post(body))).status).toBe(401);
    // Reserializar o JSON muda os bytes: a assinatura vale para o corpo exato.
    expect((await route()(post(JSON.stringify(JSON.parse(body), null, 2), signWebhook(SECRET, body)))).status).toBe(401);
  });

  it("corpo grande demais → 413, sem verificar", async () => {
    const big = "x".repeat(70 * 1024);
    expect((await route()(post(big, signWebhook(SECRET, big)))).status).toBe(413);
  });
});
