import { describe, expect, it, vi } from "vitest";
import type { StreamRecord } from "../../domain/stream";
import { GetLiveStatus } from "../stream-states/stream-states.use-case";
import { GetAgentStatus, RecordAgentHeartbeat, heartbeatSchema, privacyStatusOf, type AgentHeartbeat, type HeartbeatInput } from "./privacy-heartbeat.use-case";

const now = new Date("2026-10-02T23:30:00Z");
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);
const stream = (patch: Partial<StreamRecord> = {}) => ({ id: "s1", ownerId: "dona", entityType: "place", entityId: "lugar", control: "on", status: "live", ...patch }) as StreamRecord;
const input = (patch: Partial<HeartbeatInput> = {}): HeartbeatInput => ({ privacy_mode: "on", blur_mode: "faces", fps: 29.5, faces_per_frame: 1.2, detector_status: "ok", ...patch });
const beat = (patch: Partial<AgentHeartbeat> = {}): AgentHeartbeat => ({ streamId: "s1", privacyMode: "on", blurMode: "faces", fps: 29.5, facesPerFrame: 1.2, detectorStatus: "ok", receivedAt: now, ...patch });

describe("privacyStatusOf", () => {
  it("protegido só com heartbeat recente e o modo privacidade ligado", () => {
    expect(privacyStatusOf(null, now)).toBe("none");
    expect(privacyStatusOf(beat({ receivedAt: secondsAgo(30) }), now)).toBe("protected");
    expect(privacyStatusOf(beat({ receivedAt: secondsAgo(31) }), now)).toBe("stale");
    expect(privacyStatusOf(beat({ privacyMode: "off" }), now)).toBe("off");
    expect(privacyStatusOf(beat({ privacyMode: "off", receivedAt: secondsAgo(120) }), now)).toBe("stale");
  });
});

describe("heartbeatSchema: o contrato do agente (só números)", () => {
  it("aceita o corpo que o agente envia e recusa valores fora do contrato", () => {
    expect(heartbeatSchema.safeParse({ privacy_mode: "on", blur_mode: "full", fps: 12.5, faces_per_frame: 0, detector_status: "erro do detector", sent_at: 1790000000.5 }).success).toBe(true);
    expect(heartbeatSchema.safeParse(input({ privacy_mode: "talvez" as "on" })).success).toBe(false);
    expect(heartbeatSchema.safeParse(input({ fps: -1 })).success).toBe(false);
    expect(heartbeatSchema.safeParse(input({ detector_status: "x".repeat(61) })).success).toBe(false);
  });
});

describe("RecordAgentHeartbeat (#198)", () => {
  const deps = (found: StreamRecord | null = stream(), paused: StreamRecord | null = stream({ control: "paused", status: "paused" })) => {
    const store = {
      streamByKey: vi.fn().mockResolvedValue(found),
      save: vi.fn(async (_id: string, h: HeartbeatInput) => beat({ privacyMode: h.privacy_mode, blurMode: h.blur_mode })),
      latest: vi.fn(),
      pauseBySystem: vi.fn().mockResolvedValue(paused),
    };
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    const log = { warn: vi.fn() };
    return { store, events, log, useCase: new RecordAgentHeartbeat(store, events, log) };
  };

  it("heartbeat com privacidade ligada é registrado e nada mais acontece", async () => {
    const { store, events, useCase } = deps();
    expect(await useCase.execute("chave-de-transmissao-123", input())).toEqual({ ok: true, value: { status: "protected", paused: false } });
    expect(store.streamByKey).toHaveBeenCalledWith("chave-de-transmissao-123");
    expect(store.save).toHaveBeenCalledWith("s1", input());
    expect(store.pauseBySystem).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("quadro inteiro borrado (detector com falha) continua protegido: não pausa", async () => {
    const { store, useCase } = deps();
    expect((await useCase.execute("chave", input({ blur_mode: "full", detector_status: "detector lento" }))).ok).toBe(true);
    expect(store.pauseBySystem).not.toHaveBeenCalled();
  });

  it("privacidade desligada com a transmissão ativa: pausa na hora, registra e avisa quem assina o status", async () => {
    const { store, events, log, useCase } = deps();
    expect(await useCase.execute("chave", input({ privacy_mode: "off" }))).toEqual({ ok: true, value: { status: "off", paused: true } });
    expect(store.pauseBySystem).toHaveBeenCalledWith("s1");
    expect(events.publish).toHaveBeenCalledWith("live.StreamStatusChanged", { streamId: "s1", entityType: "place", entityId: "lugar", status: "paused" });
    expect(log.warn).toHaveBeenCalled();
  });

  it("já pausada ou encerrada pelo parceiro: só registra, sem pausar de novo", async () => {
    for (const control of ["paused", "ended"] as const) {
      const { store, events, useCase } = deps(stream({ control }));
      expect(await useCase.execute("chave", input({ privacy_mode: "off" }))).toEqual({ ok: true, value: { status: "off", paused: false } });
      expect(store.pauseBySystem).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    }
  });

  it("chave errada ou ausente: recusa sem gravar nada", async () => {
    for (const key of ["chave-errada", null]) {
      const { store, useCase } = deps(null);
      const result = await useCase.execute(key, input());
      expect(!result.ok && result.error.code).toBe("unauthorized");
      expect(store.save).not.toHaveBeenCalled();
    }
  });
});

describe("GetAgentStatus", () => {
  it("situação de cada transmissão; sem heartbeat = agente nunca conectou", async () => {
    const latest = vi.fn().mockResolvedValue([beat(), beat({ streamId: "s2", receivedAt: secondsAgo(90), blurMode: "full" })]);
    const status = new GetAgentStatus({ latest }, () => now);
    expect(await status.execute(["s1", "s2", "s3"])).toEqual({
      s1: { status: "protected", blurMode: "faces", fps: 29.5, detectorStatus: "ok", lastSeenAt: now },
      s2: { status: "stale", blurMode: "full", fps: 29.5, detectorStatus: "ok", lastSeenAt: secondsAgo(90) },
      s3: { status: "none", blurMode: null, fps: null, detectorStatus: null, lastSeenAt: null },
    });
    expect(await status.isProtected("s1")).toBe(true);
    expect(await status.isProtected("s2")).toBe(false);
    expect(await new GetAgentStatus({ latest }, () => now).execute([])).toEqual({});
  });
});

describe("status público da live com o agente", () => {
  const playback = (status: "live" | "paused") => ({ streamId: "s1", status, playbackUrl: null, note: null, liveSince: null });
  const target = { entityType: "place" as const, entityId: "11111111-1111-4111-8111-111111111111" };

  it("'rostos desfocados' só com a live no ar e o agente protegendo; falha na consulta não derruba o status", async () => {
    const on = { isProtected: vi.fn().mockResolvedValue(true) };
    const live = await new GetLiveStatus({ execute: async () => playback("live") }, undefined, on).execute(target);
    expect(live.ok && live.value.facesBlurred).toBe(true);

    const paused = await new GetLiveStatus({ execute: async () => playback("paused") }, undefined, on).execute(target);
    expect(paused.ok && paused.value.facesBlurred).toBe(false);
    expect(on.isProtected).toHaveBeenCalledTimes(1);

    const broken = await new GetLiveStatus({ execute: async () => playback("live") }, undefined, { isProtected: async () => Promise.reject(new Error("banco fora")) }).execute(target);
    expect(broken.ok && broken.value.facesBlurred).toBe(false);
  });
});
