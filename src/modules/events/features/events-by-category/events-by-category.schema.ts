import { z } from "zod";
import { categoryIds, isCategoryId, type CategoryId } from "@/shared/catalog/categories";

/**
 * RF16 — Valor da URL: uma ou várias categorias separadas por vírgula ("shows,feiras").
 * Devolve na ordem do catálogo e sem repetição, para que a mesma seleção gere sempre a mesma URL.
 */
export const categoryFilterParam = z
  .string()
  .max(300)
  .optional()
  .transform((value, ctx): CategoryId[] => {
    if (!value) return [];
    const ids = new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
    if ([...ids].some((id) => !isCategoryId(id))) {
      ctx.addIssue({ code: "custom", message: "Categoria inválida." });
      return z.NEVER;
    }
    return categoryIds.filter((id) => ids.has(id));
  });

/** Liga ou desliga uma categoria na seleção (para os chips), mantendo a ordem do catálogo. */
export function toggleCategory(selected: readonly CategoryId[], id: CategoryId): CategoryId[] {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return categoryIds.filter((c) => next.has(c));
}
