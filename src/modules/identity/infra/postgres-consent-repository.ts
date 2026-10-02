import type { Sql } from "@/shared/db/sql";
import type { ConsentRepository, Consents } from "../domain/consents";

export class PostgresConsentRepository implements ConsentRepository {
  constructor(private readonly sql: Sql) {}

  async find(userId: string): Promise<(Consents & { updatedAt: Date }) | null> {
    const [row] = await this.sql<{ analytics: boolean; geolocation: boolean; updated_at: Date }[]>`
      select analytics, geolocation, updated_at from identity.consents where user_id = ${userId}`;
    return row ? { analytics: row.analytics, geolocation: row.geolocation, updatedAt: row.updated_at } : null;
  }

  async save(userId: string, c: Consents): Promise<void> {
    await this.sql`
      insert into identity.consents (user_id, analytics, geolocation) values (${userId}, ${c.analytics}, ${c.geolocation})
      on conflict (user_id) do update set analytics = excluded.analytics, geolocation = excluded.geolocation`;
  }
}
