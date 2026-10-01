import type { Sql } from "@/shared/db/sql";
import { isRole, type Role, type RoleRepository, type UserDirectory, type UserSummary } from "../domain/roles";

export class PostgresRoleRepository implements RoleRepository, UserDirectory {
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

  async listRecent(limit: number): Promise<UserSummary[]> {
    const rows = await this.sql<{ id: string; display_name: string; email: string; roles: string[]; created_at: Date }[]>`
      select u.id, p.display_name, u.email, u.created_at,
             coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') as roles
      from auth.users u
      join identity.profiles p on p.user_id = u.id
      left join identity.user_roles r on r.user_id = u.id
      group by u.id, p.display_name
      order by u.created_at desc
      limit ${limit}`;
    return rows.map((r) => ({ id: r.id, displayName: r.display_name, email: r.email, roles: r.roles.filter(isRole), createdAt: r.created_at }));
  }
}
