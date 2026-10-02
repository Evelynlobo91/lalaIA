import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import type { Sql } from "@/shared/db/sql";
import type { EventStatus } from "../domain/event";
import type { EventCard, EventQuery, EventReader, EventSummaryReader, EventSummaryRow } from "../domain/event-card";

type Row = { id: string; title: string; category: string; place_id: string; starts_at: Date; ends_at: Date; price_cents: number };

const toCard = (r: Row): EventCard => ({
  id: r.id,
  title: r.title,
  category: r.category as CategoryId,
  placeId: r.place_id,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  priceCents: r.price_cents,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Leitura pública (dados abertos): consulta direta, sem asUser. */
export class PostgresEventReader implements EventReader, EventSummaryReader {
  constructor(private readonly sql: Sql) {}

  async findByIds(ids: string[]): Promise<EventSummaryRow[]> {
    // Id malformado nem chega ao banco (o cast para uuid falharia).
    const valid = [...new Set(ids.filter((id) => UUID.test(id)))];
    if (valid.length === 0) return [];
    const rows = await this.sql<Array<Row & { status: EventStatus }>>`
      select id, title, category, place_id, starts_at, ends_at, price_cents, status
      from events.events
      where id in ${this.sql(valid)}`;
    return rows.filter((r) => isCategoryId(r.category)).map((r) => ({ ...toCard(r), status: r.status }));
  }

  async listUpcoming(q: EventQuery): Promise<EventCard[]> {
    const cursor = q.cursor;
    // Keyset em (starts_at, id); só agendados que ainda não terminaram.
    const rows = await this.sql<Row[]>`
      select id, title, category, place_id, starts_at, ends_at, price_cents
      from events.events
      where status = 'scheduled'
        and ends_at > ${q.now}
        ${q.window ? this.sql`and starts_at < ${q.window.to} and ends_at > ${q.window.from}` : this.sql``}
        ${cursor ? this.sql`and (starts_at, id) > (${cursor.startsAt}, ${cursor.id}::uuid)` : this.sql``}
      order by starts_at, id
      limit ${q.limit}`;
    return rows.filter((r) => isCategoryId(r.category)).map(toCard);
  }
}
