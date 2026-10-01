// API pública do módulo discovery (busca e filtros, RF04/RF05).
// Consulta places e events só pelas APIs públicas deles (index.ts), sem join entre schemas.
import { search } from "./composition";
import { searchRoute } from "./features/search/search.route";
import { firstValues, searchSchema, toQueryString } from "./features/search/search.schema";
import { resultKinds, type ResultKind, type SearchResults as Results } from "./domain/search";

export { SearchBox } from "./features/search/ui/search-box";
export { SearchResults } from "./features/search/ui/search-results";
export { KindTabs } from "./features/search/ui/kind-tabs";
export type { SearchHit, SearchResults as SearchResultsData, ResultKind } from "./domain/search";

export type SearchPageState = {
  /** Valores da URL como vieram (para preencher o campo e os atalhos). */
  q: string | null;
  tipo: ResultKind | null;
  /** Parâmetros a manter ao trocar de tipo ou de busca. */
  keep: Record<string, string>;
  /** Query string da busca atual (para "carregar mais" e para reiniciar a lista quando muda). */
  query: string;
} & ({ status: "idle"; message: string } | { status: "results"; results: Results });

/** Busca a partir dos parâmetros da URL de /buscar (renderizada no servidor). Sem busca → `idle` com a dica. */
export async function searchPage(params: Record<string, string | string[] | undefined>): Promise<SearchPageState> {
  const values = firstValues(params);
  const tipo = (resultKinds as readonly string[]).includes(values.tipo ?? "") ? (values.tipo as ResultKind) : null;
  const q = values.q?.trim() || null;
  const keep: Record<string, string> = tipo ? { tipo } : {};
  const base = { q, tipo, keep, query: toQueryString({ q, tipo }) };

  const parsed = searchSchema.safeParse({ q: values.q, tipo: values.tipo });
  if (!parsed.success) return { ...base, status: "idle", message: parsed.error.issues[0]?.message ?? "Busca inválida." };

  const result = await search().execute({ text: parsed.data.q, kind: parsed.data.tipo, cursor: null, limit: parsed.data.limit });
  if (!result.ok) throw result.error;
  return { ...base, status: "results", results: result.value };
}

export const discoveryApi = {
  /** GET /api/discovery/search */
  search: searchRoute(search),
};
