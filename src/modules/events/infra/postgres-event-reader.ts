import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import type { Sql } from "@/shared/db/sql";
import type { EventCard, EventQuery, EventReader } from "../domain/event-card";

type Row = { id: string; title: string; category: string; place_id: string; starts_at: Date; ends_at: Date; price_cents: number };

/** Leitura pública (dados abertos): consulta direta, sem asUser. */
export class PostgresEventReader implements EventReader {
  constructor(private readonly sql: Sql) {}

  async listUpcoming(q: EventQuery): Promise<EventCard[]> {
    const cursor = q.cursor;
    // Keyset em (starts_at, id); só agendados que ainda não terminaram.
    const rows = await this.sql<Row[]>`
      select id, title, category, place_id, starts_at, ends_at, price_cents
      from events.events
      where status = 'scheduled'
        and ends_at > ${q.now}
        ${cursor ? this.sql`and (starts_at, id) > (${cursor.startsAt}, ${cursor.id}::uuid)` : this.sql``}
      order by starts_at, id
      limit ${q.limit}`;
    return rows
      .filter((r) => isCategoryId(r.category))
      .map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category as CategoryId,
        placeId: r.place_id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        priceCents: r.price_cents,
      }));
  }
}
