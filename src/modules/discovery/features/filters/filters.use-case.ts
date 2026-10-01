import { dateFilterLabels } from "@/modules/events";
import { categories } from "@/shared/catalog/categories";
import { ok, type DomainError, type Result } from "@/shared/kernel";
import { priceRanges, priceRangeValues } from "../../domain/price-ranges";
import { timeOfDayLabels, timeOfDayValues } from "../../domain/time-of-day";

export type FilterOption = { value: string; label: string };

/** Opções de cada filtro, para montar o painel (ou um app cliente) sem duplicar listas. */
export type FilterOptions = {
  categorias: FilterOption[];
  bairros: FilterOption[];
  datas: FilterOption[];
  horarios: FilterOption[];
  precos: FilterOption[];
};

/** Porta: bairros com lugares cadastrados (API pública do módulo places). */
export interface NeighborhoodCatalog {
  neighborhoods(): Promise<Array<{ name: string; places: number }>>;
}

/** RF05 — Opções dos filtros: catálogo de categorias, bairros com lugares, atalhos de data, horários e preços. */
export class GetFilterOptions {
  constructor(private readonly catalog: NeighborhoodCatalog) {}

  async execute(): Promise<Result<FilterOptions, DomainError>> {
    const bairros = await this.catalog.neighborhoods();
    return ok({
      categorias: categories.map((c) => ({ value: c.id, label: c.label })),
      bairros: bairros.map((b) => ({ value: b.name, label: b.name })),
      datas: (Object.keys(dateFilterLabels) as Array<keyof typeof dateFilterLabels>).map((k) => ({ value: k, label: dateFilterLabels[k] })),
      horarios: timeOfDayValues.map((v) => ({ value: v, label: timeOfDayLabels[v] })),
      precos: priceRangeValues.map((v) => ({ value: v, label: priceRanges[v].label })),
    });
  }
}
