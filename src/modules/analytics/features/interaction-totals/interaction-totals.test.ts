import { describe, expect, it, vi } from "vitest";
import { GetInteractionTotals, type InteractionTotalsReader } from "./interaction-totals";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("GetInteractionTotals (#54)", () => {
  it("agrupa por entidade e tipo; ids repetidos viram um só", async () => {
    const totals = vi.fn<InteractionTotalsReader["totals"]>(async () => [
      { entityId: A, kind: "live_view", total: 3 },
      { entityId: A, kind: "view", total: 10 },
      { entityId: B, kind: "live_view", total: 1 },
    ]);
    const since = new Date("2026-09-24T00:00:00Z");
    const result = await new GetInteractionTotals({ totals }).execute({ entityType: "live", entityIds: [A, B, A], since });
    expect(result).toEqual({ ok: true, value: { [A]: { live_view: 3, view: 10 }, [B]: { live_view: 1 } } });
    expect(totals).toHaveBeenCalledWith("live", [A, B], since);
  });

  it("sem ids não consulta; sem `since` conta desde sempre", async () => {
    const totals = vi.fn<InteractionTotalsReader["totals"]>(async () => []);
    const useCase = new GetInteractionTotals({ totals });
    expect(await useCase.execute({ entityType: "place", entityIds: [] })).toEqual({ ok: true, value: {} });
    expect(totals).not.toHaveBeenCalled();
    await useCase.execute({ entityType: "place", entityIds: [A] });
    expect(totals).toHaveBeenCalledWith("place", [A], null);
  });

  it("valida a entrada (tipo, ids e limite)", async () => {
    const useCase = new GetInteractionTotals({ totals: vi.fn() });
    for (const input of [
      { entityType: "user", entityIds: [A] },
      { entityType: "place", entityIds: ["abc"] },
      { entityType: "place", entityIds: Array.from({ length: 201 }, () => A) },
      { entityType: "place", entityIds: [A], since: "ontem" },
    ]) {
      const result = await useCase.execute(input);
      expect(!result.ok && result.error.code).toBe("validation_failed");
    }
  });
});
