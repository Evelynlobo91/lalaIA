import { describe, expect, it, vi } from "vitest";
import { GetPlaceFacets, MAX_FACET_IDS } from "./place-facets";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("GetPlaceFacets", () => {
  it("consulta só ids válidos, sem repetição", async () => {
    const reader = { facetsOf: vi.fn().mockResolvedValue([{ id: A, category: "cafes", neighborhood: "Centro" }]) };
    const result = await new GetPlaceFacets(reader).execute([A, "x", A, B]);
    expect(reader.facetsOf).toHaveBeenCalledWith([A, B]);
    expect(result).toEqual([{ id: A, category: "cafes", neighborhood: "Centro" }]);
  });

  it("lista vazia ou só inválidos: não consulta", async () => {
    const reader = { facetsOf: vi.fn() };
    expect(await new GetPlaceFacets(reader).execute([])).toEqual([]);
    expect(await new GetPlaceFacets(reader).execute(["nao-e-uuid"])).toEqual([]);
    expect(reader.facetsOf).not.toHaveBeenCalled();
  });

  it("limita a quantidade de ids por consulta", async () => {
    const reader = { facetsOf: vi.fn().mockResolvedValue([]) };
    const ids = Array.from({ length: MAX_FACET_IDS + 10 }, () => crypto.randomUUID());
    await new GetPlaceFacets(reader).execute(ids);
    expect(reader.facetsOf.mock.calls[0][0]).toHaveLength(MAX_FACET_IDS);
  });
});
