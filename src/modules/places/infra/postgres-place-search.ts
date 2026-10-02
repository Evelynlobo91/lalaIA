import { categoriesMatching } from "@/shared/catalog/category-search";
import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import type { Sql } from "@/shared/db/sql";
import { textMatch } from "@/shared/db/text-search";
import type { PlaceCard, PlaceCursor } from "../domain/place-card";
import type { Neighborhood, PlaceNeighborhoods } from "../features/search-places/neighborhoods";
import type { PlaceSearchFilter, PlaceSearchReader } from "../features/search-places/search-places";

type Row = { id: string; name: string; category: string; neighborhood: string | null; opening_hours: string | null };

/**
 * Busca de lugares no Postgres. O texto usa a configuração `platform.busca` (português, sem acento)
 * com prefixo em cada termo, sobre o índice GIN `places_name_search_idx`.
 * Bairros são comparados sem acento, sem maiúsculas e sem espaços nas pontas ("Glória" = "gloria ").
 */
export class PostgresPlaceSearch implements PlaceSearchReader, PlaceNeighborhoods {
  constructor(private readonly sql: Sql) {}

  async search(filter: PlaceSearchFilter, cursor: PlaceCursor | null, limit: number): Promise<PlaceCard[]> {
    const sql = this.sql;
    const conditions = [sql`true`];

    if (filter.text) {
      const cats = categoriesMatching(filter.text);
      // Mesma expressão de texto do índice GIN (senão o Postgres não o usa).
      const byName = textMatch(sql, sql`name`, filter.text) ?? sql`false`;
      conditions.push(cats.length ? sql`(${byName} or category in ${sql(cats)})` : byName);
    }
    if (filter.category) conditions.push(sql`category = ${filter.category}`);
    if (filter.neighborhood) conditions.push(this.inNeighborhood(filter.neighborhood));
    if (filter.withOpeningHours) conditions.push(sql`opening_hours is not null`);
    if (cursor) {
      conditions.push(sql`((name collate places.pt_br), id) > ((${cursor.name}::text collate places.pt_br), ${cursor.id}::uuid)`);
    }

    const where = conditions.reduce((acc, c) => sql`${acc} and ${c}`);
    const rows = await sql<Row[]>`
      select id, name, category, neighborhood, opening_hours from places.places
      where ${where}
      order by (name collate places.pt_br), id
      limit ${limit}`;

    return rows
      .filter((r) => isCategoryId(r.category))
      .map((r) => ({ id: r.id, name: r.name, category: r.category as CategoryId, neighborhood: r.neighborhood, openingHours: r.opening_hours }));
  }

  async neighborhoods(): Promise<Neighborhood[]> {
    // Grafias diferentes do mesmo bairro viram uma opção só (a grafia mais comum é a exibida).
    const rows = await this.sql<Neighborhood[]>`
      select trim(mode() within group (order by neighborhood)) as name, count(*)::int as places
      from places.places
      where nullif(trim(neighborhood), '') is not null
      group by lower(extensions.unaccent(trim(neighborhood)))
      order by trim(mode() within group (order by neighborhood)) collate places.pt_br`;
    return rows.map((r) => ({ name: r.name, places: r.places }));
  }

  async placeIdsIn(neighborhood: string): Promise<string[]> {
    const rows = await this.sql<{ id: string }[]>`
      select id from places.places
      where ${this.inNeighborhood(neighborhood)}`;
    return rows.map((r) => r.id);
  }

  private inNeighborhood(neighborhood: string) {
    return this.sql`lower(extensions.unaccent(trim(neighborhood))) = lower(extensions.unaccent(trim(${neighborhood}::text)))`;
  }
}
