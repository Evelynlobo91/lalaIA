import { describe, expect, it, vi } from "vitest";
import type { Role } from "../../domain/roles";
import { SetTeamRoles, teamRolesSchema, type TeamRoleStore } from "./manage-team-roles";

const USER = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const admin = { id: "admin", roles: ["admin"] as Role[] };

const store = (current: Role[] | null): TeamRoleStore => ({
  currentRoles: vi.fn().mockResolvedValue(current),
  grant: vi.fn().mockResolvedValue(undefined),
  revoke: vi.fn().mockResolvedValue(undefined),
});
const bus = () => ({ publish: vi.fn().mockResolvedValue(undefined) });

describe("teamRolesSchema", () => {
  it("aceita só comercial, financeiro e moderação; admin e parceiro não passam pelo formulário", () => {
    expect(teamRolesSchema.parse({ userId: USER, roles: ["finance", "moderator"] }).roles).toEqual(["finance", "moderator"]);
    expect(teamRolesSchema.parse({ userId: USER }).roles).toEqual([]);
    expect(teamRolesSchema.safeParse({ userId: USER, roles: ["admin"] }).success).toBe(false);
    expect(teamRolesSchema.safeParse({ userId: USER, roles: ["partner"] }).success).toBe(false);
  });
});

describe("SetTeamRoles", () => {
  it("concede o que falta, revoga o que sobrou e publica um evento por mudança", async () => {
    const s = store(["finance", "partner"]);
    const events = bus();
    const result = await new SetTeamRoles(s, events).execute(admin, USER, ["commercial"]);

    expect(result).toEqual({ ok: true, value: { userId: USER, roles: ["commercial"] } });
    expect(s.grant).toHaveBeenCalledExactlyOnceWith(USER, "commercial", "admin");
    expect(s.revoke).toHaveBeenCalledExactlyOnceWith(USER, "finance");
    expect(events.publish).toHaveBeenCalledWith("identity.RoleGranted", { userId: USER, role: "commercial", grantedBy: "admin" });
    expect(events.publish).toHaveBeenCalledWith("identity.RoleRevoked", { userId: USER, role: "finance", revokedBy: "admin" });
  });

  it("sem mudança não grava nem publica nada", async () => {
    const s = store(["moderator"]);
    const events = bus();
    await new SetTeamRoles(s, events).execute(admin, USER, ["moderator"]);
    expect(s.grant).not.toHaveBeenCalled();
    expect(s.revoke).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("nunca toca em admin nem em partner", async () => {
    const s = store(["admin", "partner"]);
    await new SetTeamRoles(s, bus()).execute(admin, USER, []);
    expect(s.revoke).not.toHaveBeenCalled();
  });

  it("só quem gerencia papéis (admin) altera; moderação não", async () => {
    const s = store([]);
    const result = await new SetTeamRoles(s, bus()).execute({ id: "mod", roles: ["moderator"] }, USER, ["finance"]);
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(s.currentRoles).not.toHaveBeenCalled();
  });

  it("conta inexistente → não encontrado", async () => {
    const result = await new SetTeamRoles(store(null), bus()).execute(admin, USER, ["finance"]);
    expect(!result.ok && result.error.code).toBe("not_found");
  });
});
