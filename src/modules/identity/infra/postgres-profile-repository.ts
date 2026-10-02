import type { Sql } from "@/shared/db/sql";
import type { Profile, ProfileRepository } from "../domain/profile";

export class PostgresProfileRepository implements ProfileRepository {
  constructor(private readonly sql: Sql) {}

  async find(userId: string): Promise<Profile | null> {
    const [row] = await this.sql<{ display_name: string; avatar_path: string | null }[]>`
      select display_name, avatar_path from identity.profiles where user_id = ${userId}`;
    return row ? { displayName: row.display_name, avatarPath: row.avatar_path } : null;
  }

  async updateDisplayName(userId: string, displayName: string): Promise<void> {
    await this.sql`update identity.profiles set display_name = ${displayName} where user_id = ${userId}`;
  }

  async replaceAvatar(userId: string, avatarPath: string): Promise<string | null> {
    // Lê o anterior e grava o novo atomicamente (evita apagar a foto errada em envios simultâneos).
    const [row] = await this.sql<{ previous: string | null }[]>`
      with old as (select avatar_path from identity.profiles where user_id = ${userId} for update)
      update identity.profiles p set avatar_path = ${avatarPath}
      from old where p.user_id = ${userId}
      returning old.avatar_path as previous`;
    return row?.previous ?? null;
  }
}
