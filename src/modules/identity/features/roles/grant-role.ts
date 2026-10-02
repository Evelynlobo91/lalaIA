import type { Sql } from "@/shared/db/sql";
import type { Role } from "../../domain/roles";

/**
 * Concede um papel (idempotente: conceder de novo não duplica nem falha).
 * Chamado por outros módulos pela API pública (ex.: aprovação de parceiro).
 */
export class GrantRole {
  constructor(private readonly sql: Sql) {}

  async execute(userId: string, role: Role, grantedBy: string | null): Promise<void> {
    await this.sql`
      insert into identity.user_roles (user_id, role, granted_by)
      values (${userId}, ${role}, ${grantedBy})
      on conflict (user_id, role) do nothing`;
  }
}
