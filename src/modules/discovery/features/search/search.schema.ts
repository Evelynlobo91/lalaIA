import { z } from "zod";
import { resultKinds } from "../../domain/search";
import { filtersShape, hasFilters, normalizeFilterParams } from "../filters/filters.schema";
import { MIN_QUERY_LENGTH, MIXED_PAGE_SIZE, SINGLE_PAGE_SIZE } from "./search-url";

/** Parâmetros da URL de /buscar e de GET /api/discovery/search: texto, tipo, paginação e filtros. */
export const searchSchema = z.preprocess(
  normalizeFilterParams,
  z
    .object({
      q: z
        .string()
        .trim()
        .max(80, "A busca pode ter até 80 caracteres.")
        .optional()
        .transform((v) => v || null),
      tipo: z
        .enum(resultKinds, "Tipo inválido.")
        .optional()
        .transform((v) => v ?? null),
      cursor: z
        .string()
        .max(600)
        .optional()
        .transform((v) => v || null),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      ...filtersShape,
    })
    .superRefine((v, ctx) => {
      if (v.cursor && !v.tipo) ctx.addIssue({ code: "custom", path: ["tipo"], message: "Informe o tipo para continuar a lista." });
      if (v.q && v.q.length < MIN_QUERY_LENGTH) ctx.addIssue({ code: "custom", path: ["q"], message: `Digite pelo menos ${MIN_QUERY_LENGTH} letras.` });
      // Sem texto, vale buscar só com filtros (ex.: eventos grátis hoje). Sem nada, não há o que buscar.
      if (!v.q && !hasFilters(v)) ctx.addIssue({ code: "custom", path: ["q"], message: "Digite o que você procura ou escolha um filtro." });
    })
    .transform((v) => ({ ...v, limit: v.limit ?? (v.tipo ? SINGLE_PAGE_SIZE : MIXED_PAGE_SIZE) })),
);

export type SearchParams = z.infer<typeof searchSchema>;
