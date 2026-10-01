import type { Sql } from "@/shared/db/sql";
import type { PlaceDraft, PlaceImportRepository, UpsertReport } from "../domain/place";

const BATCH = 500;

export class PostgresPlaceImportRepository implements PlaceImportRepository {
  constructor(private readonly sql: Sql) {}

  async upsertMany(drafts: PlaceDraft[]): Promise<UpsertReport> {
    const report: UpsertReport = { inserted: 0, updated: 0, unchanged: 0 };
    for (let i = 0; i < drafts.length; i += BATCH) {
      const batch = drafts.slice(i, i + BATCH);
      const rows = await this.sql<{ inserted: boolean }[]>`
        insert into places.places
          (source, source_id, name, category, street, house_number, neighborhood, postcode, city, phone, website, opening_hours, location)
        select d.source, d.source_id, d.name, d.category, d.street, d.house_number, d.neighborhood, d.postcode, d.city,
               d.phone, d.website, d.opening_hours,
               extensions.st_setsrid(extensions.st_makepoint(d.lon, d.lat), 4326)::extensions.geography
        from jsonb_to_recordset(${this.sql.json(batch.map(toRow) as never)}) as d(
          source text, source_id text, name text, category text, street text, house_number text, neighborhood text,
          postcode text, city text, phone text, website text, opening_hours text, lat float8, lon float8)
        on conflict (source, source_id) do update set
          name = excluded.name, category = excluded.category, street = excluded.street,
          house_number = excluded.house_number, neighborhood = excluded.neighborhood, postcode = excluded.postcode,
          phone = excluded.phone, website = excluded.website, opening_hours = excluded.opening_hours,
          location = excluded.location
        -- Só toca na linha se algo mudou, e nunca sobrescreve um lugar já editado pelo parceiro.
        where places.places.edited_by_partner_at is null
          and (places.places.name, places.places.category, places.places.street, places.places.house_number,
               places.places.neighborhood, places.places.postcode, places.places.phone, places.places.website,
               places.places.opening_hours, places.places.location::text)
              is distinct from
              (excluded.name, excluded.category, excluded.street, excluded.house_number,
               excluded.neighborhood, excluded.postcode, excluded.phone, excluded.website,
               excluded.opening_hours, excluded.location::text)
        returning (xmax = 0) as inserted`;
      const inserted = rows.filter((r) => r.inserted).length;
      report.inserted += inserted;
      report.updated += rows.length - inserted;
      report.unchanged += batch.length - rows.length;
    }
    return report;
  }
}

function toRow(d: PlaceDraft) {
  return {
    source: d.source,
    source_id: d.sourceId,
    name: d.name,
    category: d.category,
    street: d.address.street,
    house_number: d.address.houseNumber,
    neighborhood: d.address.neighborhood,
    postcode: d.address.postcode,
    city: d.address.city,
    phone: d.phone,
    website: d.website,
    opening_hours: d.openingHours,
    lat: d.location.lat,
    lon: d.location.lon,
  };
}
