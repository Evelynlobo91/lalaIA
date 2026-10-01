import { z } from "zod";
import { queryRoute } from "@/shared/http/json-route";
import type { GetFilterOptions } from "./filters.use-case";

/** GET /api/discovery/filters — opções de cada filtro (categorias, bairros, datas, horários, preços). */
export function filterOptionsRoute(getOptions: () => GetFilterOptions) {
  return queryRoute(z.object({}), () => getOptions().execute());
}
