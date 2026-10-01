import { isCategoryId } from "@/shared/catalog/categories";
import type { Sql } from "@/shared/db/sql";
import type { PlaceFacet, PlaceFacetReader } from "../features/place-facets/place-facets";

/** Categoria e bairro por id, numa consulta (dados públicos do catálogo de lugares). */
export class PostgresPlaceFacets implements PlaceFacetReader {
  constructor(private readonly sql: Sql) {}

  async facetsOf(ids: string[]): Promise<PlaceFacet[]> {
    const rows = await this.sql<{ id: string; category: string; neighborhood: string | null }[]>`
      select id, category, neighborhood from places.places where id = any(${ids}::uuid[])`;
    return rows.flatMap((r) => (isCategoryId(r.category) ? [{ id: r.id, category: r.category, neighborhood: r.neighborhood }] : []));
  }
}
