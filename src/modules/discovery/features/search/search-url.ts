// Utilitários de URL da busca, sem dependências de servidor (usados também por componentes cliente).

/** Itens por grupo quando os dois tipos aparecem juntos; com um tipo só (ou "carregar mais"), a página é maior. */
export const MIXED_PAGE_SIZE = 6;
export const SINGLE_PAGE_SIZE = 20;
export const MIN_QUERY_LENGTH = 2;

/** Só os valores de texto da URL (o Next entrega `string | string[] | undefined`). */
export function firstValues(params: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : Array.isArray(v) && v[0] ? [[k, v[0]]] : [])));
}

/** Monta a query string sem os valores vazios (links compartilháveis e limpos). */
export function toQueryString(values: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) params.set(k, v);
  return params.toString();
}

/** Link para /buscar com os parâmetros dados. */
export function searchHref(values: Record<string, string | null | undefined>): string {
  const query = toQueryString(values);
  return query ? `/buscar?${query}` : "/buscar";
}
