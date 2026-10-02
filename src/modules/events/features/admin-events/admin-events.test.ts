import { describe, expect, it, vi } from "vitest";
import { ADMIN_EVENTS_LIMIT, ListEventsForAdmin } from "./admin-events";

describe("ListEventsForAdmin", () => {
  it("só admin lista; quem não é nem chega ao banco", async () => {
    const searchAll = vi.fn().mockResolvedValue([]);
    const result = await new ListEventsForAdmin({ searchAll }).execute({ isAdmin: false }, "show");
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(searchAll).not.toHaveBeenCalled();
  });

  it("busca com o texto aparado e o limite da lista", async () => {
    const searchAll = vi.fn().mockResolvedValue([]);
    await new ListEventsForAdmin({ searchAll }).execute({ isAdmin: true }, "  show  ");
    expect(searchAll).toHaveBeenCalledWith("show", ADMIN_EVENTS_LIMIT);
  });

  it("texto longo demais vira busca vazia (lista tudo)", async () => {
    const searchAll = vi.fn().mockResolvedValue([]);
    await new ListEventsForAdmin({ searchAll }).execute({ isAdmin: true }, "x".repeat(200));
    expect(searchAll).toHaveBeenCalledWith("", ADMIN_EVENTS_LIMIT);
  });
});
