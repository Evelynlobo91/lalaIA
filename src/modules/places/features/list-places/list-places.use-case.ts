import { categories, type CategoryId } from "@/shared/catalog/categories";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import { isOpenAt } from "../../domain/opening-hours";
import type { PlaceReader } from "../../domain/place-card";
import { encodeCursor, type ListPlacesInput } from "./list-places.schema";

export type PlaceListItem = {
  id: string;
  name: string;
  category: CategoryId;
  categoryLabel: string;
  neighborhood: string | null;
  /** true = aberto, false = fechado, null = horário desconhecido (não exibir). */
  openNow: boolean | null;
};

export type PlaceListPage = { items: PlaceListItem[]; nextCursor: string | null };

const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

/** RF09 — Consultar lugares de Joinville, em ordem alfabética e paginado por cursor. */
export class ListPlaces {
  constructor(
    private readonly reader: PlaceReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ListPlacesInput): Promise<Result<PlaceListPage, DomainError>> {
    const rows = await this.reader.listAfter(input.cursor, input.limit + 1);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    const now = this.now();

    return ok({
      items: page.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        categoryLabel: labels.get(p.category) ?? p.category,
        neighborhood: p.neighborhood,
        openNow: isOpenAt(p.openingHours, now),
      })),
      nextCursor: rows.length > input.limit && last ? encodeCursor({ name: last.name, id: last.id }) : null,
    });
  }
}
