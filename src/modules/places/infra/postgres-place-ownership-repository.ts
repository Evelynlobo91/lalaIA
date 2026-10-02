import { categories, isCategoryId, type CategoryId } from "@/shared/catalog/categories";
import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { EditablePlace, PlaceEdit, PlaceOwnershipRepository, PlaceSummary } from "../domain/place-ownership";
import type { AdminPlaceCreator, NewAdminPlace } from "../features/create-place/create-place";

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

type SummaryRow = { id: string; name: string; category: string; neighborhood: string | null; managed_by: string | null };
const toSummary = (r: SummaryRow): PlaceSummary => ({
  id: r.id,
  name: r.name,
  categoryLabel: labels.get(r.category) ?? r.category,
  neighborhood: r.neighborhood,
  managed: r.managed_by !== null,
});

export class PostgresPlaceOwnershipRepository implements PlaceOwnershipRepository, AdminPlaceCreator {
  constructor(private readonly sql: Sql) {}

  async searchByName(query: string, limit: number): Promise<PlaceSummary[]> {
    // Sem acento e sem diferenciar maiúsculas; os mais parecidos primeiro.
    const rows = await this.sql<SummaryRow[]>`
      select id, name, category, neighborhood, managed_by from places.places
      where extensions.unaccent(lower(name)) like '%' || extensions.unaccent(lower(${query})) || '%'
      order by extensions.similarity(extensions.unaccent(lower(name)), extensions.unaccent(lower(${query}))) desc, name
      limit ${limit}`;
    return rows.map(toSummary);
  }

  async summary(id: string): Promise<PlaceSummary | null> {
    const [row] = await this.sql<SummaryRow[]>`select id, name, category, neighborhood, managed_by from places.places where id = ${id}`;
    return row ? toSummary(row) : null;
  }

  async summaries(ids: string[]): Promise<PlaceSummary[]> {
    if (ids.length === 0) return [];
    const rows = await this.sql<SummaryRow[]>`select id, name, category, neighborhood, managed_by from places.places where id in ${this.sql(ids)}`;
    return rows.map(toSummary);
  }

  async assignOwner(placeId: string, userId: string): Promise<boolean> {
    const rows = await this.sql`update places.places set managed_by = ${userId} where id = ${placeId} returning id`;
    return rows.length > 0;
  }

  async managedBy(userId: string): Promise<PlaceSummary[]> {
    const rows = await this.sql<SummaryRow[]>`
      select id, name, category, neighborhood, managed_by from places.places where managed_by = ${userId} order by name`;
    return rows.map(toSummary);
  }

  async findEditable(id: string): Promise<EditablePlace | null> {
    const [r] = await this.sql<
      { id: string; managed_by: string | null; name: string; category: string; street: string | null; house_number: string | null; neighborhood: string | null; phone: string | null; website: string | null; opening_hours: string | null }[]
    >`select id, managed_by, name, category, street, house_number, neighborhood, phone, website, opening_hours from places.places where id = ${id}`;
    if (!r || !isCategoryId(r.category)) return null;
    return {
      id: r.id,
      managedBy: r.managed_by,
      name: r.name,
      category: r.category as CategoryId,
      address: { street: r.street, houseNumber: r.house_number, neighborhood: r.neighborhood },
      phone: r.phone,
      website: r.website,
      openingHours: r.opening_hours,
    };
  }

  async update(actorId: string, id: string, e: PlaceEdit): Promise<boolean> {
    const rows = await asUser(
      actorId,
      (tx) => tx`
        update places.places set
          name = ${e.name}, category = ${e.category}, street = ${e.address.street}, house_number = ${e.address.houseNumber},
          neighborhood = ${e.address.neighborhood}, phone = ${e.phone}, website = ${e.website}, opening_hours = ${e.openingHours},
          edited_by_partner_at = now()
        where id = ${id}
        returning id`,
      this.sql,
    );
    return rows.length > 0;
  }

  async createByAdmin(actorId: string, p: NewAdminPlace): Promise<string> {
    // RLS: só admin insere, com origem 'admin' e em seu próprio nome. Marcado como editado: é dado da plataforma, não do OSM.
    const [row] = await asUser(
      actorId,
      (tx) => tx<{ id: string }[]>`
        insert into places.places (source, source_id, name, category, street, house_number, neighborhood, phone, website, location, edited_by_partner_at, created_by)
        values ('admin', ${`admin/${crypto.randomUUID()}`}, ${p.name}, ${p.category}, ${p.address.street}, ${p.address.houseNumber}, ${p.address.neighborhood},
                ${p.phone}, ${p.website}, extensions.st_makepoint(${p.location.lon}, ${p.location.lat})::extensions.geography, now(), ${actorId})
        returning id`,
      this.sql,
    );
    return row.id;
  }
}
