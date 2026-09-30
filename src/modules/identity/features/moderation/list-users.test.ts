import { describe, expect, it, vi } from "vitest";
import type { Role } from "../../domain/roles";
import type { CurrentUser } from "../../domain/session";
import { hasRole } from "../authorization/authorization";
import { ListUsersForModeration } from "./list-users";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("../session/current-user", () => ({ requireUser: vi.fn(), withUser: vi.fn() }));

const user = (roles: Role[]): CurrentUser => ({ id: "u1", email: "a@b.com", displayName: "A", avatarUrl: null, roles });

describe("hasRole", () => {
  it("confere o papel do usuário", () => {
    expect(hasRole(user(["admin"]), "admin")).toBe(true);
    expect(hasRole(user(["partner"]), "admin")).toBe(false);
    expect(hasRole(user([]), "partner")).toBe(false);
    expect(hasRole(null, "partner")).toBe(false);
  });
});

describe("ListUsersForModeration", () => {
  const directory = () => ({ listRecent: vi.fn().mockResolvedValue([]) });

  it("admin lista usuários", async () => {
    const dir = directory();
    expect((await new ListUsersForModeration(dir).execute(user(["admin"]))).ok).toBe(true);
    expect(dir.listRecent).toHaveBeenCalledWith(50);
  });

  it.each([[[]], [["partner"]]] as Role[][][])("sem papel admin (%j) é recusado sem consultar o banco", async (roles) => {
    const dir = directory();
    const res = await new ListUsersForModeration(dir).execute(user(roles));
    expect(!res.ok && res.error.code).toBe("forbidden");
    expect(dir.listRecent).not.toHaveBeenCalled();
  });

  it("limita o tamanho da página", async () => {
    const dir = directory();
    await new ListUsersForModeration(dir).execute(user(["admin"]), 10_000);
    expect(dir.listRecent).toHaveBeenCalledWith(200);
  });
});
