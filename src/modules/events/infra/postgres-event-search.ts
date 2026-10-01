import { categoriesMatching } from "@/shared/catalog/category-search";
import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import type { Sql } from "@/shared/db/sql";
import { textMatch } from "@/shared/db/text-search";
import type { EventCard, EventCursor } from "../domain/event-card";
import type { EventSearchFilter, EventSearchReader } from "../features/search-events/search-events";

type Row = { id: string; title: string; category: string; place_id: string; starts_at: Date; ends_at: Date; price_cents: number };

/**
 * Busca de eventos no Postgres (dados abertos, sem asUser). O texto usa `platform.busca` (português,
 * sem acento) com prefixo em cada termo, sobre o índice GIN `events_text_search_idx`.
 */
export class PostgresEventSearch implements EventSearchReader {
  constructor(private readonly sql: Sql) {}

  async search(filter: EventSearchFilter, cursor: EventCursor | null, limit: number): Promise<EventCard[]> {
    const sql = this.sql;
    const conditions = [sql`status = 'scheduled'`, sql`ends_at > ${filter.now}`];

    if (filter.text) {
      const cats = categoriesMatching(filter.text);
      // Mesma expressão de texto do índice GIN (senão o Postgres não o usa).
      const byText = textMatch(sql, sql`title || ' ' || description`, filter.text) ?? sql`false`;
      conditions.push(cats.length ? sql`(${byText} or category in ${sql(cats)})` : byText);
    }
    if (filter.category) conditions.push(sql`category = ${filter.category}`);
    if (filter.placeIds) {
      if (filter.placeIds.length === 0) return [];
      conditions.push(sql`place_id in ${sql(filter.placeIds)}`);
    }
    if (filter.periods) {
      if (filter.periods.length === 0) return [];
      // Sobreposição com algum período: começa antes do fim dele e termina depois do início.
      const overlaps = filter.periods.map((p) => sql`(starts_at < ${p.to} and ends_at > ${p.from})`);
      conditions.push(sql`(${overlaps.reduce((acc, o) => sql`${acc} or ${o}`)})`);
    }
    if (filter.price) {
      conditions.push(sql`price_cents >= ${filter.price.minCents}`);
      if (filter.price.maxCents !== null) conditions.push(sql`price_cents <= ${filter.price.maxCents}`);
    }
    if (cursor) conditions.push(sql`(starts_at, id) > (${cursor.startsAt}, ${cursor.id}::uuid)`);

    const where = conditions.reduce((acc, c) => sql`${acc} and ${c}`);
    const rows = await sql<Row[]>`
      select id, title, category, place_id, starts_at, ends_at, price_cents
      from events.events
      where ${where}
      order by starts_at, id
      limit ${limit}`;

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
