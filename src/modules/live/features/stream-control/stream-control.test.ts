import { describe, expect, it, vi } from "vitest";
import { statusOf, type LiveActor, type StreamControl, type StreamRecord } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";
import { streamControlSchema } from "./stream-control.schema";
import { ControlStream, EndStreamOfCancelledEvent } from "./stream-control.use-case";

const ana: LiveActor = { id: "ana", isPartner: true, isAdmin: false };
const bia: LiveActor = { id: "bia", isPartner: true, isAdmin: false };
const admin: LiveActor = { id: "adm", isPartner: false, isAdmin: true };

function setup(initial: { control?: StreamControl; signal?: "offline" | "live" } = {}) {
  const make = (control: StreamControl, signal: "offline" | "live"): StreamRecord => ({
    id: "s1",
    ownerId: "ana",
    entityType: "event",
    entityId: "e1",
    provider: "fake",
    providerStreamId: "ls-1",
    playbackId: "pb",
    control,
    signal,
    status: statusOf(control, signal),
    signalChangedAt: new Date(),
    createdAt: new Date(),
  });
  let current = make(initial.control ?? "on", initial.signal ?? "live");
  const order: string[] = [];
  const streams = { findById: vi.fn(async () => current), findByTarget: vi.fn(async () => current) };
  const control = {
    setControl: vi.fn(async (_actor: string, _id: string, change: { control: StreamControl; kind: string }) => {
      order.push(`db:${change.kind}`);
      current = make(change.control, current.signal);
      return current;
    }),
    endBySystem: vi.fn(async () => {
      order.push("db:system-ended");
      current = make("ended", current.signal);
      return current;
    }),
  };
  const provider = {
    disable: vi.fn(async () => {
      order.push("provider:disable");
    }),
    enable: vi.fn(async () => {
      order.push("provider:enable");
    }),
  } as unknown as StreamingProvider;
  const publish = vi.fn(async () => {});
  const useCase = new ControlStream(streams, control, () => provider, { publish });
  return { useCase, streams, control, provider, publish, order, current: () => current };
}

describe("ControlStream (#49)", () => {
  it("encerrar: desativa no provedor ANTES de gravar, marca ended e publica", async () => {
    const s = setup();
    const result = await s.useCase.execute(ana, "s1", "end");
    expect(result.ok && result.value.status).toBe("ended");
    expect(s.order).toEqual(["provider:disable", "db:ended"]);
    expect(s.publish).toHaveBeenCalledWith("live.StreamStatusChanged", { streamId: "s1", entityType: "event", entityId: "e1", status: "ended" });
  });

  it("pausar: só oculta o player (não mexe na ingestão do provedor)", async () => {
    const s = setup();
    const result = await s.useCase.execute(ana, "s1", "pause");
    expect(result.ok && result.value).toMatchObject({ status: "paused", signal: "live" });
    expect(s.provider.disable).not.toHaveBeenCalled();
    expect(s.order).toEqual(["db:paused"]);
  });

  it("ativar depois de pausar volta ao vivo sem chamar o provedor; depois de encerrar, reabilita a chave", async () => {
    const paused = setup({ control: "paused" });
    expect((await paused.useCase.execute(ana, "s1", "activate")).ok).toBe(true);
    expect(paused.current().status).toBe("live");
    expect(paused.provider.enable).not.toHaveBeenCalled();

    const ended = setup({ control: "ended", signal: "offline" });
    await ended.useCase.execute(ana, "s1", "activate");
    expect(ended.order).toEqual(["provider:enable", "db:activated"]);
    expect(ended.current().status).toBe("waiting");
  });

  it("é idempotente: repetir a mesma ação não chama provedor nem publica", async () => {
    const s = setup({ control: "ended" });
    const result = await s.useCase.execute(ana, "s1", "end");
    expect(result.ok).toBe(true);
    expect(s.order).toEqual([]);
    expect(s.publish).not.toHaveBeenCalled();
  });

  it("não pausa transmissão encerrada", async () => {
    const s = setup({ control: "ended" });
    const result = await s.useCase.execute(ana, "s1", "pause");
    expect(!result.ok && result.error.code).toBe("stream_ended");
  });

  it("só o dono ou admin controla", async () => {
    const s = setup();
    const denied = await s.useCase.execute(bia, "s1", "end");
    expect(!denied.ok && denied.error.code).toBe("forbidden");
    expect(s.provider.disable).not.toHaveBeenCalled();
    expect((await s.useCase.execute(admin, "s1", "end")).ok).toBe(true);
  });

  it("valida a entrada", () => {
    expect(streamControlSchema.safeParse({ streamId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f", action: "end" }).success).toBe(true);
    expect(streamControlSchema.safeParse({ streamId: "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f", action: "delete" }).success).toBe(false);
  });
});

describe("EndStreamOfCancelledEvent", () => {
  it("evento cancelado encerra a live dele (provedor + banco); de novo não faz nada", async () => {
    const s = setup();
    const useCase = new EndStreamOfCancelledEvent(s.streams, s.control, () => s.provider, { publish: s.publish });
    await useCase.execute("e1");
    await useCase.execute("e1");
    expect(s.order).toEqual(["provider:disable", "db:system-ended"]);
    expect(s.publish).toHaveBeenCalledOnce();
  });
});
