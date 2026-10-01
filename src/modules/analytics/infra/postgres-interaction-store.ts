import type { Sql } from "@/shared/db/sql";
import type { Interaction, InteractionStore } from "../domain/interaction";

/** Grava em `analytics.events` (append-only). Evento de domínio repetido é ignorado pelo `event_id` único. */
export class PostgresInteractionStore implements InteractionStore {
  constructor(private readonly sql: Sql) {}

  async record(i: Interaction): Promise<void> {
    const eventId = i.source === "domain" ? i.eventId : null;
    await this.sql`
      insert into analytics.events (kind, entity_type, entity_id, source, event_id, occurred_at)
      values (${i.kind}, ${i.entityType}, ${i.entityId}, ${i.source}, ${eventId}, ${i.occurredAt})
      on conflict (event_id) do nothing`;
  }
}
