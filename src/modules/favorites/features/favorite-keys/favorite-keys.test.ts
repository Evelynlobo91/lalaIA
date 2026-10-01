import { describe, expect, it, vi } from "vitest";
import { ListFavoriteKeys } from "./favorite-keys";

describe("ListFavoriteKeys", () => {
  it("devolve só tipo e id dos favoritos do usuário, numa consulta", async () => {
    const favorites = {
      listByUser: vi.fn().mockResolvedValue([
        { entityType: "place", entityId: "p1", createdAt: new Date() },
        { entityType: "event", entityId: "e1", createdAt: new Date() },
      ]),
    };
    expect(await new ListFavoriteKeys(favorites).execute("u1")).toEqual([
      { entityType: "place", entityId: "p1" },
      { entityType: "event", entityId: "e1" },
    ]);
    expect(favorites.listByUser).toHaveBeenCalledWith("u1");
  });
});
