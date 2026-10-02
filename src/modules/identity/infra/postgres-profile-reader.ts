import type { Sql } from "@/shared/db/sql";
import type { ProfileReader } from "../domain/session";

export class PostgresProfileReader implements ProfileReader {
  constructor(private readonly sql: Sql) {}

  async displayNameOf(userId: string): Promise<string | null> {
    const [row] = await this.sql<{ display_name: string }[]>`select display_name from identity.profiles where user_id = ${userId}`;
    return row?.display_name ?? null;
  }
}
