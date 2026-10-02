// API pública do módulo discovery (busca e filtros, RF04/RF05).
// Consulta places e events só pelas APIs públicas deles (index.ts), sem join entre schemas.
import { filterOptions as filterOptionsUseCase, search, searchFilters } from "./composition";
import { filterOptionsRoute } from "./features/filters/filters.route";
import { describeFilters, filterParams, filtersSchema, filtersToParams, normalizeFilterParams, type FilterParam } from "./features/filters/filters.schema";
import type { FilterOptions } from "./features/filters/filters.use-case";
import type { ActiveFilterChip } from "./features/filters/ui/active-filters";
import { searchRoute } from "./features/search/search.route";
import { searchSchema } from "./features/search/search.schema";
import { firstValues, searchHref, toQueryString } from "./features/search/search-url";
import { resultKinds, type ResultKind, type SearchResults as Results } from "./domain/search";

export { SearchBox } from "./features/search/ui/search-box";
export { SearchResults } from "./features/search/ui/search-results";
export { KindTabs } from "./features/search/ui/kind-tabs";
export { SearchFilters } from "./features/filters/ui/search-filters";
export { ActiveFilters } from "./features/filters/ui/active-filters";
export type { SearchHit, SearchResults as SearchResultsData, ResultKind } from "./domain/search";
export type { FilterOptions } from "./features/filters/filters.use-case";

export type SearchPageState = {
  /** Valores da URL como vieram (para preencher o campo, os atalhos e os filtros). */
  q: string | null;
  tipo: ResultKind | null;
  filters: Partial<Record<FilterParam, string>>;
  /** Filtros ativos como chips removíveis e o link "Limpar filtros" (mantém busca e tipo). */
  chips: ActiveFilterChip[];
  clearHref: string;
  /** Query string da busca atual (para "carregar mais" e para reiniciar a lista quando muda). */
  query: string;
} & ({ status: "idle"; message: string; invalid: boolean } | { status: "results"; results: Results });

/**
 * Busca a partir dos parâmetros da URL de /buscar (renderizada no servidor).
 * Sem busca nem filtro → `idle` com a dica; filtro inválido (ex.: data impossível) → `idle` com o aviso.
 */
export async function searchPage(params: Record<string, string | string[] | undefined>): Promise<SearchPageState> {
  const values = normalizeFilterParams(firstValues(params)) as Record<string, string>;
  const tipo = (resultKinds as readonly string[]).includes(values.tipo ?? "") ? (values.tipo as ResultKind) : null;
  const q = values.q?.trim() || null;

  // Filtros válidos voltam para a URL normalizados; um inválido é ignorado nos links (e avisado abaixo).
  const parsedFilters = filtersSchema.safeParse(Object.fromEntries(filterParams.map((p) => [p, values[p]])));
  const filters = parsedFilters.success ? filtersToParams(parsedFilters.data) : {};
  const chips = parsedFilters.success
    ? describeFilters(parsedFilters.data).map(({ param, label }) => ({ label, removeHref: searchHref({ q, tipo, ...filters, [param]: null }) }))
    : [];
  const base = { q, tipo, filters, chips, clearHref: searchHref({ q, tipo }), query: toQueryString({ q, tipo, ...filters }) };

  const parsed = searchSchema.safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ...base, status: "idle", message: issue?.message ?? "Busca inválida.", invalid: issue?.path[0] !== "q" };
  }

  const result = await search().execute(
    { text: parsed.data.q, kind: parsed.data.tipo, cursor: null, limit: parsed.data.limit },
    searchFilters().from(parsed.data),
  );
  if (!result.ok) throw result.error;
  return { ...base, status: "results", results: result.value };
}

/** Opções dos filtros (categorias, bairros com lugares, datas, horários e preços). */
export async function filterOptions(): Promise<FilterOptions> {
  const result = await filterOptionsUseCase().execute();
  if (!result.ok) throw result.error;
  return result.value;
}

export const discoveryApi = {
  /** GET /api/discovery/search */
  search: searchRoute(search, searchFilters),
  /** GET /api/discovery/filters */
  filters: filterOptionsRoute(filterOptionsUseCase),
};
