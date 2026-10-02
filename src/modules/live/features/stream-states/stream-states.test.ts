import { describe, expect, it, vi } from "vitest";
import { liveStatusRoute } from "./stream-states.route";
import { GetLiveStatus, liveViewState } from "./stream-states.use-case";

const ENTITY = "11111111-1111-4111-8111-111111111111";

describe("liveViewState (#51: mensagens claras)", () => {
  it.each([
    ["waiting", false, "waiting", "Aguardando sinal"],
    ["live", false, "live", "Ao vivo"],
    ["paused", false, "paused", "Transmissão pausada"],
    ["ended", false, "ended", "Transmissão encerrada"],
    ["live", true, "unavailable", "Transmissão indisponível"],
  ] as const)("status %s (erro no player: %s) → %s", (status, failed, kind, title) => {
    const view = liveViewState(status, failed);
    expect(view).toMatchObject({ kind, title });
    expect(view.message.length).toBeGreaterThan(10);
  });

  it("erro antigo do player não vale para quem está pausado/encerrado; sem transmissão → nada", () => {
    expect(liveViewState("paused", true).kind).toBe("paused");
    expect(liveViewState("ended", true).kind).toBe("ended");
    expect(liveViewState("none", false).kind).toBe("hidden");
  });
});

describe("GetLiveStatus", () => {
  it("devolve o status atual, ou none quando não há transmissão", async () => {
    const since = new Date("2026-10-01T22:00:00Z");
    const live = new GetLiveStatus({ execute: async () => ({ streamId: "s1", status: "live", playbackUrl: "https://hls/x.m3u8", note: "Casa cheia", liveSince: since }) });
    expect(await live.execute({ entityType: "place", entityId: ENTITY })).toEqual({
      ok: true,
      value: { status: "live", streamId: "s1", playbackUrl: "https://hls/x.m3u8", note: "Casa cheia", liveSince: "2026-10-01T22:00:00.000Z" },
    });
    const none = new GetLiveStatus({ execute: async () => null });
    expect(await none.execute({ entityType: "place", entityId: ENTITY })).toEqual({ ok: true, value: { status: "none", streamId: null, playbackUrl: null, note: null, liveSince: null } });
  });
});

describe("GET /api/live/status", () => {
  const execute = vi.fn(async () => ({ streamId: "s1", status: "paused" as const, playbackUrl: null, note: "Volta às 23h", liveSince: null }));
  const route = liveStatusRoute(() => new GetLiveStatus({ execute }));

  it("200 com o status e sem cache", async () => {
    const response = await route(new Request(`http://localhost/api/live/status?entityType=event&entityId=${ENTITY}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "paused", streamId: "s1", playbackUrl: null, note: "Volta às 23h", liveSince: null });
  });

  it("400 para parâmetros inválidos", async () => {
    for (const query of ["entityType=mission&entityId=" + ENTITY, "entityType=place&entityId=1", ""]) {
      expect((await route(new Request(`http://localhost/api/live/status?${query}`))).status).toBe(400);
    }
  });
});
