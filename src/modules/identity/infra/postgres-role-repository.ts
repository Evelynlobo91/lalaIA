import type { Sql } from "@/shared/db/sql";
import { isRole, type Role, type RoleRepository, type UserDirectory, type UserSummary } from "../domain/roles";
import type { TeamRole, TeamRoleStore } from "../features/roles/manage-team-roles";

export class PostgresRoleRepository implements RoleRepository, UserDirectory, TeamRoleStore {
  constructor(private readonly sql: Sql) {}

  async rolesOf(userId: string): Promise<Role[]> {
    const rows = await this.sql<{ role: string }[]>`select role from identity.user_roles where user_id = ${userId} order by role`;
    return rows.map((r) => r.role).filter(isRole);
  }

  /** Nome e e-mail de vários usuários (para outros módulos exibirem quem fez o quê). */
  async byIds(ids: string[]): Promise<Array<{ id: string; displayName: string; email: string }>> {
    if (ids.length === 0) return [];
    const rows = await this.sql<{ id: string; display_name: string; email: string }[]>`
      select u.id, p.display_name, u.email
      from auth.users u join identity.profiles p on p.user_id = u.id
      where u.id in ${this.sql(ids)}`;
    return rows.map((r) => ({ id: r.id, displayName: r.display_name, email: r.email }));
  }

  async listRecent(limit: number, text?: string): Promise<UserSummary[]> {
    // O texto é tratado como literal no `ilike` (% e _ não viram curinga).
    const pattern = text ? `%${text.replace(/[\\%_]/g, "\\$&")}%` : null;
    const rows = await this.sql<{ id: string; display_name: string; email: string; roles: string[]; created_at: Date }[]>`
      select u.id, p.display_name, u.email, u.created_at,
             coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') as roles
      from auth.users u
      join identity.profiles p on p.user_id = u.id
      left join identity.user_roles r on r.user_id = u.id
      ${pattern ? this.sql`where p.display_name ilike ${pattern} or u.email ilike ${pattern}` : this.sql``}
      group by u.id, p.display_name
      order by u.created_at desc
      limit ${limit}`;
    return rows.map((r) => ({ id: r.id, displayName: r.display_name, email: r.email, roles: r.roles.filter(isRole), createdAt: r.created_at }));
  }

  /** Papéis atuais; null se a conta não existe. */
  async currentRoles(userId: string): Promise<Role[] | null> {
    const [user] = await this.sql<{ id: string }[]>`select user_id as id from identity.profiles where user_id = ${userId}`;
    return user ? this.rolesOf(userId) : null;
  }

  async grant(userId: string, role: TeamRole, grantedBy: string): Promise<void> {
    await this.sql`insert into identity.user_roles (user_id, role, granted_by) values (${userId}, ${role}, ${grantedBy}) on conflict (user_id, role) do nothing`;
  }

  async revoke(userId: string, role: TeamRole): Promise<void> {
    await this.sql`delete from identity.user_roles where user_id = ${userId} and role = ${role}`;
  }

  /** Pessoas com pelo menos um dos papéis, por nome (sem repetição). */
  async withAnyRole(roles: readonly Role[]): Promise<Array<{ id: string; displayName: string }>> {
    if (roles.length === 0) return [];
    return this.sql<{ id: string; displayName: string }[]>`
      select distinct p.user_id as id, p.display_name as "displayName"
      from identity.user_roles r join identity.profiles p on p.user_id = r.user_id
      where r.role in ${this.sql([...roles])}
      order by p.display_name, p.user_id`;
  }
}
