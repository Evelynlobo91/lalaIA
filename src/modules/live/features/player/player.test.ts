import { describe, expect, it, vi } from "vitest";
import { statusOf, type StreamControl, type StreamRecord, type StreamSignal } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";
import { liveTargetSchema } from "./player.schema";
import { GetLivePlayback, ListActiveStreams } from "./player.use-case";

const target = { entityType: "place" as const, entityId: "11111111-1111-4111-8111-111111111111" };
const record = (control: StreamControl, signal: StreamSignal, id = "s1"): StreamRecord => ({
  id,
  ownerId: "ana",
  ...target,
  provider: "fake",
  providerStreamId: "ls-1",
  playbackId: "pb-1",
  control,
  signal,
  status: statusOf(control, signal),
  signalChangedAt: new Date(),
  createdAt: new Date(),
  note: null,
});

const provider = { playbackUrl: (id: string) => `https://stream.mux.com/${id}.m3u8` } as StreamingProvider;

describe("GetLivePlayback (#50)", () => {
  it("ao vivo → URL HLS do provedor", async () => {
    const useCase = new GetLivePlayback({ findByTarget: async () => record("on", "live") }, () => provider);
    const result = await useCase.execute(target);
    expect(result).toMatchObject({ streamId: "s1", status: "live", playbackUrl: "https://stream.mux.com/pb-1.m3u8", note: null });
    expect(result?.liveSince).toBeInstanceOf(Date);
  });

  it.each([
    ["on", "offline", "waiting"],
    ["paused", "live", "paused"],
    ["ended", "live", "ended"],
  ] as const)("controle %s + sinal %s → %s, sem URL (o player some)", async (control, signal, status) => {
    const useCase = new GetLivePlayback({ findByTarget: async () => record(control, signal) }, () => provider);
    expect(await useCase.execute(target)).toEqual({ streamId: "s1", status, playbackUrl: null, note: null, liveSince: null });
  });

  it("sem transmissão → null, sem tocar no provedor (páginas sem live não exigem configuração)", async () => {
    const factory = vi.fn(() => provider);
    expect(await new GetLivePlayback({ findByTarget: async () => null }, factory).execute(target)).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it("valida o alvo", () => {
    expect(liveTargetSchema.safeParse(target).success).toBe(true);
    expect(liveTargetSchema.safeParse({ ...target, entityId: "abc" }).success).toBe(false);
    expect(liveTargetSchema.safeParse({ ...target, entityType: "mission" }).success).toBe(false);
  });
});

describe("ListActiveStreams (#50)", () => {
  it("só ids das lives no ar; limite entre 1 e 100", async () => {
    const listLive = vi.fn<(limit: number) => Promise<StreamRecord[]>>(async () => [record("on", "live", "s1"), record("on", "live", "s2")]);
    const useCase = new ListActiveStreams({ listLive });
    expect(await useCase.execute()).toEqual([
      { streamId: "s1", ...target },
      { streamId: "s2", ...target },
    ]);
    await useCase.execute(5000);
    await useCase.execute(0);
    expect(listLive.mock.calls.map(([n]) => n)).toEqual([100, 100, 1]);
  });
});
