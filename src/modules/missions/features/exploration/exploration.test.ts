import { describe, expect, it, vi } from "vitest";
import { GetMissionExploration } from "./exploration";

const ANA = "11111111-1111-4111-8111-111111111111";

describe("GetMissionExploration", () => {
  it("devolve as contagens do leitor para o usuário", async () => {
    const value = { completedMissions: 2, checkIns: 5, visitedPlaceIds: ["p1", "p2"] };
    const reader = { explorationOf: vi.fn().mockResolvedValue(value) };
    expect(await new GetMissionExploration(reader).execute(ANA)).toEqual(value);
    expect(reader.explorationOf).toHaveBeenCalledWith(ANA);
  });

  it("id inválido: tudo zerado, sem consultar", async () => {
    const reader = { explorationOf: vi.fn() };
    expect(await new GetMissionExploration(reader).execute("x")).toEqual({ completedMissions: 0, checkIns: 0, visitedPlaceIds: [] });
    expect(reader.explorationOf).not.toHaveBeenCalled();
  });
});
