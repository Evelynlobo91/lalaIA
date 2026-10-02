import { describe, expect, it, vi } from "vitest";
import type { StreamRecord } from "../../domain/stream";
import { EndStreamsWithoutPlan } from "./plan-suspension";

const stream = (patch: Partial<StreamRecord>): StreamRecord => ({ id: "s1", ownerId: "dono", providerStreamId: "prov-1", control: "on", ...patch }) as StreamRecord;

const deps = (entitled: boolean, streams: StreamRecord[]) => {
  const disable = vi.fn().mockResolvedValue(undefined);
  const endBySystem = vi.fn().mockResolvedValue(stream({}));
  const log = { warn: vi.fn() };
  const useCase = new EndStreamsWithoutPlan({ listByOwner: vi.fn().mockResolvedValue(streams) }, { endBySystem }, () => ({ disable }) as never, vi.fn().mockResolvedValue(entitled), log);
  return { disable, endBySystem, log, useCase };
};

describe("EndStreamsWithoutPlan (assinatura suspensa, #154)", () => {
  it("sem direito à live: desliga no provedor e encerra as transmissões que não estavam encerradas", async () => {
    const { disable, endBySystem, useCase } = deps(false, [stream({ id: "a", providerStreamId: "pa" }), stream({ id: "b", providerStreamId: "pb", control: "paused" }), stream({ id: "c", control: "ended" })]);
    expect(await useCase.execute("dono")).toBe(2);
    expect(disable.mock.calls.map((c) => c[0])).toEqual(["pa", "pb"]);
    expect(endBySystem.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("se o plano que sobrou ainda libera a live, nada é encerrado", async () => {
    const { disable, endBySystem, useCase } = deps(true, [stream({})]);
    expect(await useCase.execute("dono")).toBe(0);
    expect(disable).not.toHaveBeenCalled();
    expect(endBySystem).not.toHaveBeenCalled();
  });

  it("falha no provedor não impede o encerramento no app", async () => {
    const { disable, endBySystem, log, useCase } = deps(false, [stream({})]);
    disable.mockRejectedValueOnce(new Error("provedor fora do ar"));
    expect(await useCase.execute("dono")).toBe(1);
    expect(endBySystem).toHaveBeenCalledWith("s1");
    expect(log.warn).toHaveBeenCalled();
  });
});
