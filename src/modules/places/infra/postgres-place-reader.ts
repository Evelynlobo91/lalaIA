import type { Sql } from "@/shared/db/sql";
import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import type { PlaceCard, PlaceCursor, PlaceReader } from "../domain/place-card";

type Row = { id: string; name: string; category: string; neighborhood: string | null; opening_hours: string | null };

export class PostgresPlaceReader implements PlaceReader {
  constructor(private readonly sql: Sql) {}

  async listAfter(cursor: PlaceCursor | null, limit: number): Promise<PlaceCard[]> {
    // Keyset pagination: compara (nome, id) com o último item visto. Usa o índice places_name_id_idx.
    const rows = cursor
      ? await this.sql<Row[]>`
          select id, name, category, neighborhood, opening_hours from places.places
          where ((name collate places.pt_br), id) > ((${cursor.name}::text collate places.pt_br), ${cursor.id}::uuid)
          order by (name collate places.pt_br), id
          limit ${limit}`
      : await this.sql<Row[]>`
          select id, name, category, neighborhood, opening_hours from places.places
          order by (name collate places.pt_br), id
          limit ${limit}`;

    return rows
      .filter((r) => isCategoryId(r.category))
      .map((r) => ({ id: r.id, name: r.name, category: r.category as CategoryId, neighborhood: r.neighborhood, openingHours: r.opening_hours }));
  }
}
