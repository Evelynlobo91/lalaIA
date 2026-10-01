import { describe, expect, it, vi } from "vitest";
import { statusOf, type LiveActor, type StreamControl, type StreamRecord } from "../../domain/stream";
import { GetLivePlayback } from "../player/player.use-case";
import { streamNoteSchema } from "./stream-context.schema";
import { GetStreamContext, UpdateStreamNote, liveForLabel } from "./stream-context.use-case";

const ana: LiveActor = { id: "ana", isPartner: true, isAdmin: false };
const bia: LiveActor = { id: "bia", isPartner: true, isAdmin: false };
const admin: LiveActor = { id: "adm", isPartner: false, isAdmin: true };
const STREAM = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const since = new Date("2026-10-01T22:00:00Z");

const record = (patch: Partial<StreamRecord> & { control?: StreamControl } = {}): StreamRecord => {
  const control = patch.control ?? "on";
  const signal = patch.signal ?? "live";
  return {
    id: STREAM,
    ownerId: "ana",
    entityType: "event",
    entityId: "e1",
    provider: "fake",
    providerStreamId: "ls-1",
    playbackId: "pb",
    signalChangedAt: since,
    createdAt: since,
    note: null,
    ...patch,
    control,
    signal,
    status: statusOf(control, signal),
  };
};

function setup(current = record()) {
  const streams = { findById: vi.fn(async () => current) };
  const notes = { setNote: vi.fn(async (_actor: string, _id: string, note: string | null) => ({ ...current, note })) };
  return { useCase: new UpdateStreamNote(streams, notes), notes };
}

describe("UpdateStreamNote (#53: situação atual)", () => {
  it("dona atualiza e limpa a situação", async () => {
    const s = setup();
    const result = await s.useCase.execute(ana, STREAM, "Casa cheia");
    expect(result.ok && result.value.note).toBe("Casa cheia");
    expect(s.notes.setNote).toHaveBeenCalledWith("ana", STREAM, "Casa cheia");
    expect((await s.useCase.execute(ana, STREAM, null)).ok).toBe(true);
  });

  it("só a dona ou admin; outra parceira é barrada sem gravar", async () => {
    const s = setup();
    const denied = await s.useCase.execute(bia, STREAM, "Forjada");
    expect(!denied.ok && denied.error.code).toBe("forbidden");
    expect(s.notes.setNote).not.toHaveBeenCalled();
    expect((await s.useCase.execute(admin, STREAM, "Moderada")).ok).toBe(true);
  });

  it("mesma situação não grava de novo; transmissão inexistente → 404; banco recusa → proibido", async () => {
    const same = setup(record({ note: "Casa cheia" }));
    expect((await same.useCase.execute(ana, STREAM, "Casa cheia")).ok).toBe(true);
    expect(same.notes.setNote).not.toHaveBeenCalled();

    const missing = new UpdateStreamNote({ findById: async () => null }, { setNote: vi.fn() });
    const notFound = await missing.execute(ana, STREAM, "x");
    expect(!notFound.ok && notFound.error.code).toBe("not_found");

    const rls = new UpdateStreamNote({ findById: async () => record() }, { setNote: async () => null });
    const refused = await rls.execute(ana, STREAM, "x");
    expect(!refused.ok && refused.error.code).toBe("forbidden");
  });

  it("valida: uma linha, até 80 caracteres; vazio limpa", () => {
    expect(streamNoteSchema.parse({ streamId: STREAM, note: "  Show\ncomeça   22h " })).toEqual({ streamId: STREAM, note: "Show começa 22h" });
    expect(streamNoteSchema.parse({ streamId: STREAM, note: "   " })).toEqual({ streamId: STREAM, note: null });
    expect(streamNoteSchema.safeParse({ streamId: STREAM, note: "x".repeat(81) }).success).toBe(false);
    expect(streamNoteSchema.safeParse({ streamId: "1", note: "ok" }).success).toBe(false);
  });
});

describe("contexto público da live (#53)", () => {
  const provider = { playbackUrl: (id: string) => `https://hls/${id}.m3u8` } as never;

  it("ao vivo: situação e desde quando; pausada mantém a situação; encerrada não mostra", async () => {
    const live = await new GetLivePlayback({ findByTarget: async () => record({ note: "Casa cheia" }) }, () => provider).execute({ entityType: "event", entityId: "e1" });
    expect(live).toMatchObject({ status: "live", note: "Casa cheia", liveSince: since });
    const paused = await new GetLivePlayback({ findByTarget: async () => record({ control: "paused", note: "Volta às 23h" }) }, () => provider).execute({ entityType: "event", entityId: "e1" });
    expect(paused).toMatchObject({ status: "paused", note: "Volta às 23h", liveSince: null });
    const ended = await new GetLivePlayback({ findByTarget: async () => record({ control: "ended", note: "Casa cheia" }) }, () => provider).execute({ entityType: "event", entityId: "e1" });
    expect(ended).toMatchObject({ status: "ended", note: null, liveSince: null });
  });

  it("GetStreamContext: evento, lugar e horário pelo diretório; inexistente → null", async () => {
    const info = { entityType: "event" as const, entityId: "e1", title: "Show", subtitle: "Bar do Zé", whenLabel: "sáb., 20:00 – 23:00", href: "/eventos/e1", location: null };
    const describeTargets = vi.fn(async () => [info]);
    expect(await new GetStreamContext({ describe: describeTargets }).execute({ entityType: "event", entityId: "e1" })).toEqual(info);
    expect(await new GetStreamContext({ describe: async () => [] }).execute({ entityType: "event", entityId: "e1" })).toBeNull();
  });

  it.each([
    [0, "agora há pouco"],
    [59_000, "agora há pouco"],
    [12 * 60_000, "há 12 min"],
    [60 * 60_000, "há 1 h"],
    [65 * 60_000, "há 1 h 05 min"],
    [-5_000, "agora há pouco"],
  ])("há quanto tempo está ao vivo (%i ms) → %s", (elapsed, label) => {
    expect(liveForLabel(since, new Date(since.getTime() + elapsed))).toBe(label);
  });
});
