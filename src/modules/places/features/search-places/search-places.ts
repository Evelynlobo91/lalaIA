import { categories, type CategoryId } from "@/shared/catalog/categories";
import { err, ok, ValidationError, type DomainError, type Result } from "@/shared/kernel";
import { isOpenAt } from "../../domain/opening-hours";
import type { PlaceCard, PlaceCursor } from "../../domain/place-card";
import { decodeCursor, encodeCursor } from "../list-places/list-places.schema";
import type { PlaceListItem, PlaceListPage } from "../list-places/list-places.use-case";

/** O que a busca pede ao banco (texto e filtros que o SQL resolve sozinho). */
export type PlaceSearchFilter = {
  /** Texto livre: casa com o nome (sem acento, por prefixo) ou com o nome da categoria. */
  text: string | null;
};

export interface PlaceSearchReader {
  /** Lugares que atendem ao filtro, em ordem alfabética depois do cursor (keyset em nome + id). */
  search(filter: PlaceSearchFilter, cursor: PlaceCursor | null, limit: number): Promise<PlaceCard[]>;
}

/** Critérios públicos da busca de lugares (usados pelo módulo discovery). */
export type PlaceSearchCriteria = {
  text?: string | null;
  /** Cursor opaco devolvido pela página anterior. */
  cursor: string | null;
  limit: number;
};

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

export function toPlaceListItem(p: PlaceCard, now: Date): PlaceListItem {
  return {
    id: p.id,
    name: p.name,
    category: p.category as CategoryId,
    categoryLabel: labels.get(p.category) ?? p.category,
    neighborhood: p.neighborhood,
    openNow: isOpenAt(p.openingHours, now),
  };
}

/** RF04 — Busca de lugares por texto (e filtros), paginada por cursor em ordem alfabética. */
export class SearchPlaces {
  constructor(
    private readonly reader: PlaceSearchReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(criteria: PlaceSearchCriteria): Promise<Result<PlaceListPage, DomainError>> {
    const cursor = criteria.cursor ? decodeCursor(criteria.cursor) : null;
    if (criteria.cursor && !cursor) return err(new ValidationError("Cursor inválido."));

    const filter: PlaceSearchFilter = { text: criteria.text?.trim() || null };
    const rows = await this.reader.search(filter, cursor, criteria.limit + 1);
    const page = rows.slice(0, criteria.limit);
    const last = page.at(-1);
    const now = this.now();

    return ok({
      items: page.map((p) => toPlaceListItem(p, now)),
      nextCursor: rows.length > criteria.limit && last ? encodeCursor({ name: last.name, id: last.id }) : null,
    });
  }
}
