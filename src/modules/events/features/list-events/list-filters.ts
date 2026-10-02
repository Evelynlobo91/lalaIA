import type { CategoryId } from "@/shared/catalog/categories";
import { dateFilterValue, type DateFilter } from "../../domain/date-window";

/** Estado dos filtros da lista pública, sempre na URL (compartilhável). */
export type EventListFilters = { quando: DateFilter | null; categorias: CategoryId[] };

export const noEventFilters: EventListFilters = { quando: null, categorias: [] };

/** "quando=hoje&categoria=shows,feiras" (sem "?"). Ids de categoria são slugs, não precisam de escape. */
export function eventListQuery(filters: EventListFilters): string {
  const parts: string[] = [];
  if (filters.quando) parts.push(`quando=${encodeURIComponent(dateFilterValue(filters.quando))}`);
  if (filters.categorias.length) parts.push(`categoria=${filters.categorias.join(",")}`);
  return parts.join("&");
}

export function eventListHref(filters: EventListFilters, basePath = "/eventos"): string {
  const query = eventListQuery(filters);
  return query ? `${basePath}?${query}` : basePath;
}
