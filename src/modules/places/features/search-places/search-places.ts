import { categories, type CategoryId } from "@/shared/catalog/categories";
import { err, ok, ValidationError, type DomainError, type Result } from "@/shared/kernel";
import { isOpenAt, isOpenDuring, momentsWithin } from "../../domain/opening-hours";
import type { PlaceCard, PlaceCursor } from "../../domain/place-card";
import { decodeCursor, encodeCursor } from "../list-places/list-places.schema";
import type { PlaceListItem, PlaceListPage } from "../list-places/list-places.use-case";

/** O que a busca pede ao banco (texto e filtros que o SQL resolve sozinho). */
export type PlaceSearchFilter = {
  /** Texto livre: casa com o nome (sem acento, por prefixo) ou com o nome da categoria. */
  text: string | null;
  category?: CategoryId;
  /** Bairro (sem diferenciar acento nem maiúsculas). */
  neighborhood?: string;
  /** Só lugares com horário de funcionamento cadastrado. */
  withOpeningHours?: boolean;
};

export interface PlaceSearchReader {
  /** Lugares que atendem ao filtro, em ordem alfabética depois do cursor (keyset em nome + id). */
  search(filter: PlaceSearchFilter, cursor: PlaceCursor | null, limit: number): Promise<PlaceCard[]>;
}

export type Period = { from: Date; to: Date };

/** Critérios públicos da busca de lugares (usados pelo módulo discovery). */
export type PlaceSearchCriteria = {
  text?: string | null;
  category?: CategoryId;
  neighborhood?: string;
  /** Só lugares abertos em algum momento destes períodos (horário desconhecido fica de fora). */
  openDuring?: Period[];
  /** Cursor opaco devolvido pela página anterior. */
  cursor: string | null;
  limit: number;
};

/** Lugares lidos por vez quando o horário de funcionamento precisa ser conferido em memória. */
export const OPEN_SCAN_BATCH = 100;

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

/** RF04/RF05 — Busca de lugares por texto e filtros, paginada por cursor em ordem alfabética. */
export class SearchPlaces {
  constructor(
    private readonly reader: PlaceSearchReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(criteria: PlaceSearchCriteria): Promise<Result<PlaceListPage, DomainError>> {
    const cursor = criteria.cursor ? decodeCursor(criteria.cursor) : null;
    if (criteria.cursor && !cursor) return err(new ValidationError("Cursor inválido."));

    const filter: PlaceSearchFilter = {
      text: criteria.text?.trim() || null,
      ...(criteria.category && { category: criteria.category }),
      ...(criteria.neighborhood && { neighborhood: criteria.neighborhood }),
    };
    const rows = criteria.openDuring
      ? await this.openDuring(filter, criteria.openDuring, cursor, criteria.limit + 1)
      : await this.reader.search(filter, cursor, criteria.limit + 1);
    const page = rows.slice(0, criteria.limit);
    const last = page.at(-1);
    const now = this.now();

    return ok({
      items: page.map((p) => toPlaceListItem(p, now)),
      nextCursor: rows.length > criteria.limit && last ? encodeCursor({ name: last.name, id: last.id }) : null,
    });
  }

  /**
   * O horário do OSM só é interpretado em memória: lê em lotes (na mesma ordem do cursor) e fica com quem
   * abre no período até completar a página. O próximo cursor é o último item devolvido, então nada se perde.
   */
  private async openDuring(filter: PlaceSearchFilter, periods: Period[], cursor: PlaceCursor | null, wanted: number): Promise<PlaceCard[]> {
    const moments = momentsWithin(periods);
    if (moments.length === 0) return [];
    const found: PlaceCard[] = [];
    let position = cursor;
    for (;;) {
      const batch = await this.reader.search({ ...filter, withOpeningHours: true }, position, OPEN_SCAN_BATCH);
      for (const place of batch) {
        if (isOpenDuring(place.openingHours, moments)) found.push(place);
        if (found.length === wanted) return found;
      }
      if (batch.length < OPEN_SCAN_BATCH) return found;
      const last = batch.at(-1)!;
      position = { name: last.name, id: last.id };
    }
  }
}
