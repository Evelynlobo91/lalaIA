import type { Sql } from "@/shared/db/sql";
import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import type { PlaceCard, PlaceCursor, PlaceReader } from "../domain/place-card";
import type { PlaceDetails, PlaceDetailsReader } from "../domain/place-details";

type Row = { id: string; name: string; category: string; neighborhood: string | null; opening_hours: string | null };

type DetailsRow = Row & {
  street: string | null;
  house_number: string | null;
  postcode: string | null;
  city: string;
  phone: string | null;
  website: string | null;
  source: "osm" | "partner";
  lat: number;
  lon: number;
};

export class PostgresPlaceReader implements PlaceReader, PlaceDetailsReader {
  constructor(private readonly sql: Sql) {}

  async findById(id: string): Promise<PlaceDetails | null> {
    const [r] = await this.sql<DetailsRow[]>`
      select id, name, category, street, house_number, neighborhood, postcode, city, phone, website, opening_hours, source,
             extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lon
      from places.places where id = ${id}`;
    if (!r || !isCategoryId(r.category)) return null;
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      address: { street: r.street, houseNumber: r.house_number, neighborhood: r.neighborhood, postcode: r.postcode, city: r.city },
      phone: r.phone,
      website: r.website,
      openingHours: r.opening_hours,
      location: { lat: r.lat, lon: r.lon },
      source: r.source,
    };
  }

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
