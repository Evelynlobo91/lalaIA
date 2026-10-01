import { z } from "zod";
import { resultKinds, type ResultKind } from "../../domain/search";

/** Itens por grupo quando os dois tipos aparecem juntos; com um tipo só (ou "carregar mais"), a página é maior. */
export const MIXED_PAGE_SIZE = 6;
export const SINGLE_PAGE_SIZE = 20;
export const MIN_QUERY_LENGTH = 2;

/** Parâmetros da URL de /buscar e de GET /api/discovery/search. */
export const searchSchema = z
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
  })
  .superRefine((v, ctx) => {
    if (v.cursor && !v.tipo) ctx.addIssue({ code: "custom", path: ["tipo"], message: "Informe o tipo para continuar a lista." });
    if (!v.q) ctx.addIssue({ code: "custom", path: ["q"], message: "Digite o que você procura." });
    else if (v.q.length < MIN_QUERY_LENGTH) ctx.addIssue({ code: "custom", path: ["q"], message: `Digite pelo menos ${MIN_QUERY_LENGTH} letras.` });
  })
  .transform((v) => ({ ...v, limit: v.limit ?? (v.tipo ? SINGLE_PAGE_SIZE : MIXED_PAGE_SIZE) }));

export type SearchParams = z.infer<typeof searchSchema>;

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

export type SearchUrlState = { q: string | null; tipo: ResultKind | null };
