import { describe, expect, it, vi } from "vitest";
import { ADMIN_MISSIONS_LIMIT, ListMissionsForAdmin } from "./admin-missions";

describe("ListMissionsForAdmin", () => {
  it("só admin lista; quem não é nem chega ao banco", async () => {
    const searchAll = vi.fn().mockResolvedValue([]);
    const result = await new ListMissionsForAdmin({ searchAll }).execute({ isAdmin: false }, "rota");
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(searchAll).not.toHaveBeenCalled();
  });

  it("busca com o texto aparado e o limite da lista", async () => {
    const searchAll = vi.fn().mockResolvedValue([]);
    await new ListMissionsForAdmin({ searchAll }).execute({ isAdmin: true }, "  rota  ");
    expect(searchAll).toHaveBeenCalledWith("rota", ADMIN_MISSIONS_LIMIT);
  });
});
