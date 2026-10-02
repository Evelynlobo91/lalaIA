import { describe, expect, it } from "vitest";
import { can, capabilities, internalRoles, roleCapabilities } from "./capabilities";
import type { Role } from "./roles";

const user = (...roles: Role[]) => ({ roles });

describe("capacidades por papel (#157)", () => {
  it("admin pode tudo", () => {
    for (const capability of capabilities) expect(can(user("admin"), capability)).toBe(true);
  });

  it("comercial cuida de leads e não vê o financeiro nem modera", () => {
    expect(can(user("commercial"), "leads:write")).toBe(true);
    expect(can(user("commercial"), "billing:read")).toBe(false);
    expect(can(user("commercial"), "partners:review")).toBe(false);
    expect(can(user("commercial"), "content:edit")).toBe(false);
  });

  it("financeiro cuida de cobrança e não vê leads nem modera", () => {
    expect(can(user("finance"), "billing:write")).toBe(true);
    expect(can(user("finance"), "leads:read")).toBe(false);
    expect(can(user("finance"), "partners:suspend")).toBe(false);
  });

  it("moderação aprova, suspende e edita conteúdo, sem financeiro, leads, auditoria ou gestão de papéis", () => {
    for (const capability of ["partners:review", "partners:suspend", "content:edit", "users:read"] as const) expect(can(user("moderator"), capability)).toBe(true);
    for (const capability of ["billing:read", "leads:read", "audit:read", "metrics:read", "roles:manage"] as const) expect(can(user("moderator"), capability)).toBe(false);
  });

  it("todo papel interno entra no backoffice; parceiro e usuário comum não", () => {
    for (const role of internalRoles) expect(can(user(role), "backoffice:access")).toBe(true);
    expect(can(user("partner"), "backoffice:access")).toBe(false);
    expect(can(user(), "backoffice:access")).toBe(false);
    expect(can(null, "backoffice:access")).toBe(false);
  });

  it("papéis se somam", () => {
    const both = user("commercial", "finance");
    expect(can(both, "leads:write")).toBe(true);
    expect(can(both, "billing:write")).toBe(true);
    expect(can(both, "content:edit")).toBe(false);
  });

  it("só o admin gerencia papéis, e nenhuma capacidade fora do catálogo é concedida", () => {
    expect(internalRoles.filter((role) => roleCapabilities[role].includes("roles:manage"))).toEqual(["admin"]);
    for (const role of internalRoles) for (const capability of roleCapabilities[role]) expect(capabilities).toContain(capability);
  });
});
