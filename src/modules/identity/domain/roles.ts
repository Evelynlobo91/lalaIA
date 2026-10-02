/** Papéis além do "usuário comum" (que toda conta tem). */
export const roles = ["partner", "admin"] as const;
export type Role = (typeof roles)[number];

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

export interface RoleRepository {
  rolesOf(userId: string): Promise<Role[]>;
}

/** Linha da lista de moderação (admin). */
export type UserSummary = { id: string; displayName: string; email: string; roles: Role[]; createdAt: Date };

export interface UserDirectory {
  listRecent(limit: number): Promise<UserSummary[]>;
}
