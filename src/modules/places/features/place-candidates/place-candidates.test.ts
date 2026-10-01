import { describe, expect, it, vi } from "vitest";
import { FindPlaceCandidates, MAX_CANDIDATE_RADIUS_M, MAX_PLACE_CANDIDATES } from "./place-candidates";

function setup() {
  const reader = { candidates: vi.fn().mockResolvedValue([]) };
  return { reader, useCase: new FindPlaceCandidates(reader) };
}

describe("FindPlaceCandidates", () => {
  it("repassa a consulta limitando quantidade e raio", async () => {
    const { reader, useCase } = setup();
    const origin = { lat: -26.3, lon: -48.84 };
    await useCase.execute({ origin, radiusMeters: 999_999, categories: ["bares"], limit: 5_000 });
    expect(reader.candidates).toHaveBeenCalledWith({ origin, radiusMeters: MAX_CANDIDATE_RADIUS_M, categories: ["bares"], limit: MAX_PLACE_CANDIDATES });
  });

  it("lista de categorias vazia não consulta o banco", async () => {
    const { reader, useCase } = setup();
    expect(await useCase.execute({ origin: null, radiusMeters: 1000, categories: [], limit: 10 })).toEqual([]);
    expect(reader.candidates).not.toHaveBeenCalled();
  });
});
