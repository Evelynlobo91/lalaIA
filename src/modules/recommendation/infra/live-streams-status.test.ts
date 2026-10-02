import { describe, expect, it, vi } from "vitest";
import { LiveStreamsStatus } from "./live-streams-status";

describe("LiveStreamsStatus (#52: Recomendação lê as lives reais)", () => {
  it("transforma as lives no ar em chaves kind:id", async () => {
    const listActive = vi.fn(async () => [
      { streamId: "s1", entityType: "place", entityId: "p1" },
      { streamId: "s2", entityType: "event", entityId: "e1" },
    ]);
    const keys = await new LiveStreamsStatus(listActive).liveNow();
    expect([...keys]).toEqual(["place:p1", "event:e1"]);
  });

  it("falha do módulo Live sobe (o motor segue sem live e loga)", async () => {
    await expect(new LiveStreamsStatus(async () => Promise.reject(new Error("fora"))).liveNow()).rejects.toThrow("fora");
  });
});
