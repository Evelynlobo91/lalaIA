import { describe, expect, it, vi } from "vitest";
import { statusOf, type LiveTargetDirectory, type StreamRecord, type StreamTarget } from "../../domain/stream";
import { ListActiveStreams } from "../player/player.use-case";
import { liveNowRoute } from "./live-badge.route";
import { LIVE_NOW_CACHE_CONTROL } from "./live-badge.schema";
import { GetActiveStreams, GetLiveNowGeo, ListLiveNow } from "./live-badge.use-case";

const PLACE = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";
const since = new Date("2026-10-01T22:00:00Z");

const live = (id: string, target: StreamTarget): StreamRecord => ({
  id,
  ownerId: "ana",
  ...target,
  provider: "fake",
  providerStreamId: `ls-${id}`,
  playbackId: "pb",
  control: "on",
  signal: "live",
  status: statusOf("on", "live"),
  signalChangedAt: since,
  createdAt: since,
});

const directory: LiveTargetDirectory = {
  describe: vi.fn(async (targets: StreamTarget[]) =>
    targets.flatMap((t) =>
      t.entityId === GONE
        ? []
        : [
            t.entityType === "place"
              ? { ...t, title: "Bar do Zé", subtitle: "Centro", whenLabel: null, href: `/lugares/${t.entityId}`, location: { lat: -26.3045123456, lon: -48.8456123456 } }
              : { ...t, title: "Show", subtitle: "Bar do Zé", whenLabel: "sáb., 20:00 – 23:00", href: `/eventos/${t.entityId}`, location: null },
          ],
    ),
  ),
};

const streams = [live("s1", { entityType: "place", entityId: PLACE }), live("s2", { entityType: "event", entityId: EVENT }), live("s3", { entityType: "place", entityId: GONE })];

describe("ListLiveNow (#52: lista 'Com live agora')", () => {
  it("junta as lives no ar com nome, lugar e horário; lugar/evento apagado fica de fora; limite 1..50", async () => {
    const listLive = vi.fn(async () => streams);
    const items = await new ListLiveNow({ listLive }, directory).execute();
    expect(items).toEqual([
      expect.objectContaining({ streamId: "s1", entityType: "place", title: "Bar do Zé", href: `/lugares/${PLACE}`, liveSince: since }),
      expect.objectContaining({ streamId: "s2", entityType: "event", whenLabel: "sáb., 20:00 – 23:00", location: null }),
    ]);
    await new ListLiveNow({ listLive }, directory).execute(500);
    expect(listLive.mock.calls.map((c) => (c as unknown[])[0])).toEqual([50, 50]);
  });

  it("sem live no ar não consulta places/events", async () => {
    const describeTargets = vi.fn();
    expect(await new ListLiveNow({ listLive: async () => [] }, { describe: describeTargets }).execute()).toEqual([]);
    expect(describeTargets).not.toHaveBeenCalled();
  });
});

describe("GetLiveNowGeo (#52: camada do mapa)", () => {
  it("GeoJSON [lon, lat] só com o que tem coordenadas, sem dono nem chave", async () => {
    const geo = await new GetLiveNowGeo(new ListLiveNow({ listLive: async () => streams }, directory)).execute();
    expect(geo.ok && geo.value).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "s1",
          geometry: { type: "Point", coordinates: [-48.845612, -26.304512] },
          properties: { streamId: "s1", entityType: "place", title: "Bar do Zé", subtitle: "Centro", href: `/lugares/${PLACE}` },
        },
      ],
    });
    expect(JSON.stringify(geo)).not.toContain("ana");
  });
});

describe("GET /api/live/active (#52: polling do selo)", () => {
  const route = liveNowRoute(() => new GetActiveStreams(new ListActiveStreams({ listLive: async () => streams })));

  it("só tipo e id das lives no ar, com cache curto na CDN", async () => {
    const response = await route(new Request("http://localhost/api/live/active?x=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(LIVE_NOW_CACHE_CONTROL);
    expect(await response.json()).toEqual({
      streams: [
        { entityType: "place", entityId: PLACE },
        { entityType: "event", entityId: EVENT },
        { entityType: "place", entityId: GONE },
      ],
    });
  });

  it("erro inesperado vira 500 sem cache", async () => {
    const failing = liveNowRoute(() => new GetActiveStreams({ execute: async () => Promise.reject(new Error("db fora")) }));
    const response = await failing(new Request("http://localhost/api/live/active"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).not.toBe(LIVE_NOW_CACHE_CONTROL);
  });
});
