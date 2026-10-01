import { queryRoute } from "@/shared/http/json-route";
import { searchSchema } from "./search.schema";
import type { Search } from "./search.use-case";

/** GET /api/discovery/search?q=&tipo=&cursor= — resultados agrupados por tipo ("carregar mais" de um grupo com tipo + cursor). */
export function searchRoute(search: () => Search) {
  return queryRoute(searchSchema, (input) => search().execute({ text: input.q, kind: input.tipo, cursor: input.cursor, limit: input.limit }));
}
