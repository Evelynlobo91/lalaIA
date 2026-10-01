import Link from "next/link";
import { categories } from "@/shared/catalog/categories";
import { eventListHref, type EventListFilters } from "../../list-events/list-filters";
import { chip } from "../../list-events/ui/event-date-filter";
import { toggleCategory } from "../events-by-category.schema";

/**
 * RF16 — Chips de categoria (uma ou várias). Cada chip liga/desliga a categoria e preserva o filtro
 * de data. Links puros: funciona sem JavaScript e o estado fica na URL. No celular, rola na horizontal.
 */
export function EventCategoryFilter({ filters, basePath = "/eventos" }: { filters: EventListFilters; basePath?: string }) {
  const selected = new Set(filters.categorias);
  return (
    <nav aria-label="Filtrar por categoria" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2 pb-1 sm:flex-wrap">
        <li>
          <Link
            href={eventListHref({ ...filters, categorias: [] }, basePath)}
            aria-current={selected.size === 0 ? "true" : undefined}
            className={chip(selected.size === 0)}
          >
            Todas as categorias
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.id}>
            <Link
              href={eventListHref({ ...filters, categorias: toggleCategory(filters.categorias, c.id) }, basePath)}
              aria-current={selected.has(c.id) ? "true" : undefined}
              className={chip(selected.has(c.id))}
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
