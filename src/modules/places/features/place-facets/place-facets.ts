import { z } from "zod";
import type { CategoryId } from "@/shared/catalog/categories";

/** Categoria e bairro de um lugar (ex.: contar categorias e bairros explorados no progression). */
export type PlaceFacet = { id: string; category: CategoryId; neighborhood: string | null };

export interface PlaceFacetReader {
  facetsOf(ids: string[]): Promise<PlaceFacet[]>;
}

export const MAX_FACET_IDS = 500;

const idsSchema = z.array(z.string()).transform((ids) => [...new Set(ids.filter((id) => z.uuid().safeParse(id).success))].slice(0, MAX_FACET_IDS));

/** Categoria e bairro de vários lugares numa consulta. Ids inválidos ou repetidos são ignorados; inexistentes ficam de fora. */
export class GetPlaceFacets {
  constructor(private readonly reader: PlaceFacetReader) {}

  async execute(ids: string[]): Promise<PlaceFacet[]> {
    const valid = idsSchema.parse(ids);
    return valid.length === 0 ? [] : this.reader.facetsOf(valid);
  }
}
