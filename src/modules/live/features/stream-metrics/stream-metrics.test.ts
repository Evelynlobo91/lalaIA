import { describe, expect, it, vi } from "vitest";
import { statusOf, type LiveActor, type StreamRecord, type StreamTarget } from "../../domain/stream";
import { GetStreamMetrics, type InteractionCounter } from "./stream-metrics.use-case";

const ana: LiveActor = { id: "ana", isPartner: true, isAdmin: false };
const now = new Date("2026-10-08T12:00:00Z");
const weekAgo = new Date("2026-10-01T12:00:00Z");

const stream = (id: string, target: StreamTarget): StreamRecord => ({
  id,
  ownerId: "ana",
  ...target,
  provider: "fake",
  providerStreamId: `ls-${id}`,
  playbackId: "pb",
  control: "on",
  signal: "offline",
  status: statusOf("on", "offline"),
  signalChangedAt: now,
  createdAt: now,
  note: null,
});

describe("GetStreamMetrics (#54)", () => {
  it("assistiram (live_view da transmissão) e acessos à página (view do lugar/evento), total e últimos 7 dias", async () => {
    type Totals = Awaited<ReturnType<InteractionCounter["totals"]>>;
    const totals = vi.fn<InteractionCounter["totals"]>(async (type, _ids, since): Promise<Totals> => {
      const recent = since !== undefined;
      if (type === "live") return { s1: { live_view: recent ? 2 : 5 }, s2: { live_view: 1 } };
      if (type === "place") return { p1: { view: recent ? 10 : 40, favorite: 3 } };
      return {};
    });
    const listByOwner = vi.fn(async () => [stream("s1", { entityType: "place", entityId: "p1" }), stream("s2", { entityType: "event", entityId: "e1" })]);
    const metrics = await new GetStreamMetrics({ listByOwner }, { totals }, () => now).execute(ana);

    expect(metrics).toEqual({
      s1: { watched: { total: 5, recent: 2 }, pageViews: { total: 40, recent: 10 } },
      s2: { watched: { total: 1, recent: 1 }, pageViews: { total: 0, recent: 0 } },
    });
    expect(listByOwner).toHaveBeenCalledWith("ana");
    expect(totals).toHaveBeenCalledWith("live", ["s1", "s2"], undefined);
    expect(totals).toHaveBeenCalledWith("live", ["s1", "s2"], weekAgo);
    expect(totals).toHaveBeenCalledWith("place", ["p1"], weekAgo);
    expect(totals).toHaveBeenCalledWith("event", ["e1"], undefined);
  });

  it("sem transmissões não consulta o Analytics; tipo sem transmissão também não", async () => {
    const totals = vi.fn<InteractionCounter["totals"]>(async () => ({}));
    expect(await new GetStreamMetrics({ listByOwner: async () => [] }, { totals }).execute(ana)).toEqual({});
    expect(totals).not.toHaveBeenCalled();

    await new GetStreamMetrics({ listByOwner: async () => [stream("s1", { entityType: "place", entityId: "p1" })] }, { totals }).execute(ana);
    expect(totals.mock.calls.map(([type]) => type).sort()).toEqual(["live", "live", "place", "place"]);
  });

  it("resposta inválida do Analytics é recusada (validada com zod)", async () => {
    const totals = vi.fn(async () => ({ s1: { live_view: -1 } }));
    await expect(new GetStreamMetrics({ listByOwner: async () => [stream("s1", { entityType: "place", entityId: "p1" })] }, { totals }).execute(ana)).rejects.toThrow();
  });
});
