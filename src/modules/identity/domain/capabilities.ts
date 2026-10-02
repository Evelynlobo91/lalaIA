import type { Role } from "./roles";

/** O que um papel interno pode fazer. As políticas RLS perguntam pela mesma capacidade (`authz.has_capability`). */
export const capabilities = [
  "backoffice:access",
  "users:read",
  "roles:manage",
  "partners:review",
  "partners:suspend",
  "content:edit",
  "leads:read",
  "leads:write",
  "billing:read",
  "billing:write",
  "metrics:read",
  "audit:read",
] as const;

export type Capability = (typeof capabilities)[number];

/** Papéis do time da plataforma (o parceiro não é papel interno). */
export const internalRoles = ["admin", "commercial", "finance", "moderator"] as const;
export type InternalRole = (typeof internalRoles)[number];

export const internalRoleLabels: Record<InternalRole, string> = {
  admin: "Admin",
  commercial: "Comercial",
  finance: "Financeiro",
  moderator: "Moderação",
};

export const internalRoleDescriptions: Record<InternalRole, string> = {
  admin: "Acesso total ao backoffice.",
  commercial: "Leads e conversão em parceiro, sem acesso ao financeiro.",
  finance: "Assinaturas, faturas e inadimplência.",
  moderator: "Aprova parceiros e vínculos e edita conteúdo, sem acesso ao financeiro.",
};

/**
 * Papel → capacidades. Espelhado na tabela `authz.role_capabilities` (migration); o teste de integração
 * `role-capabilities.int.test.ts` falha se os dois divergirem.
 */
export const roleCapabilities: Record<InternalRole, readonly Capability[]> = {
  admin: capabilities,
  commercial: ["backoffice:access", "leads:read", "leads:write"],
  finance: ["backoffice:access", "billing:read", "billing:write"],
  moderator: ["backoffice:access", "users:read", "partners:review", "partners:suspend", "content:edit"],
};

export function isInternalRole(role: string): role is InternalRole {
  return (internalRoles as readonly string[]).includes(role);
}

/** A pessoa tem a capacidade, por qualquer um dos seus papéis? */
export function can(user: { roles: readonly Role[] } | null, capability: Capability): boolean {
  return Boolean(user?.roles.some((role) => isInternalRole(role) && roleCapabilities[role].includes(capability)));
}
