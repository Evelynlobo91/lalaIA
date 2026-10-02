import type { Sql } from "@/shared/db/sql";
import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import type { PlaceCard, PlaceCursor, PlaceReader } from "../domain/place-card";
import type { PlaceDetails, PlaceDetailsReader } from "../domain/place-details";
import type { PlacePoint, PlacePointsReader } from "../features/places-map/places-geo";
import type { NearbyPlace, NearbyPlacesReader, PlaceDistanceReader } from "../features/nearby-places/nearby-places.use-case";
import type { Coordinates } from "../domain/place";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PostgresPlaceReader implements PlaceReader, PlaceDetailsReader, PlacePointsReader, NearbyPlacesReader, PlaceDistanceReader {
  constructor(private readonly sql: Sql) {}

  async distancesFrom(origin: Coordinates, ids: string[]): Promise<Map<string, number>> {
    const valid = [...new Set(ids.filter((id) => UUID.test(id)))];
    if (valid.length === 0) return new Map();
    const rows = await this.sql<{ id: string; distance: number }[]>`
      select id, extensions.st_distance(location,
               extensions.st_setsrid(extensions.st_makepoint(${origin.lon}, ${origin.lat}), 4326)::extensions.geography) as distance
      from places.places
      where id in ${this.sql(valid)}`;
    return new Map(rows.map((r) => [r.id, Number(r.distance)]));
  }

  async nearby(origin: Coordinates, radiusMeters: number, limit: number): Promise<NearbyPlace[]> {
    // ST_DWithin usa o índice GiST (places_location_idx); a ordenação é só sobre o que está no raio.
    const rows = await this.sql<(Row & { distance: number })[]>`
      with origem as (
        select extensions.st_setsrid(extensions.st_makepoint(${origin.lon}, ${origin.lat}), 4326)::extensions.geography as ponto
      )
      select p.id, p.name, p.category, p.neighborhood, p.opening_hours,
             extensions.st_distance(p.location, origem.ponto) as distance
      from places.places p, origem
      where extensions.st_dwithin(p.location, origem.ponto, ${radiusMeters})
      order by distance, p.id
      limit ${limit}`;
    return rows
      .filter((r) => isCategoryId(r.category))
      .map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category as CategoryId,
        neighborhood: r.neighborhood,
        openingHours: r.opening_hours,
        distanceMeters: r.distance,
      }));
  }

  async allPoints(): Promise<PlacePoint[]> {
    const rows = await this.sql<{ id: string; name: string; category: string; lat: number; lon: number }[]>`
      select id, name, category,
             extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lon
      from places.places`;
    return rows.filter((r) => isCategoryId(r.category)).map((r) => ({ ...r, category: r.category as CategoryId }));
  }

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
