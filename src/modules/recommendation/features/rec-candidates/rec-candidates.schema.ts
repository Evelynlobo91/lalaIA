import { z } from "zod";
import { servicePointShape } from "@/modules/places";
import { isCategoryId, type CategoryId } from "@/shared/catalog/categories";

const point = z.object(servicePointShape);

/**
 * Localização opcional (lat e lon juntos), validada na área atendida e já arredondada para ~10 m.
 * Reutilizada pelas outras entradas do módulo. Nunca é gravada nem logada.
 */
export const optionalOrigin = z
  .object({ lat: z.string().max(20).optional(), lon: z.string().max(20).optional() })
  .transform((value, ctx) => {
    if (value.lat === undefined && value.lon === undefined) return null;
    const parsed = point.safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: parsed.error.issues[0]?.message ?? "Localização inválida." });
      return z.NEVER;
    }
    return parsed.data;
  });

/** `categoria=shows,feiras` → ["shows", "feiras"] (sem repetição); vazio → null (todas). */
export const categoryListParam = z
  .string()
  .max(400)
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const ids = [...new Set(value.split(",").map((s) => s.trim()).filter(Boolean))];
    if (!ids.every(isCategoryId)) {
      ctx.addIssue({ code: "custom", message: "Categoria inválida." });
      return z.NEVER;
    }
    return ids.length ? (ids as CategoryId[]) : null;
  });

/** Parâmetros explícitos (sem perfil): tempo em minutos, orçamento total em reais, pessoas, raio em km, categorias, lat/lon. */
export const candidatesParams = z.object({
  tempo: z.coerce.number().int().min(15).max(720).default(120),
  orcamento: z.coerce.number().int().min(0).max(10_000).optional(),
  pessoas: z.coerce.number().int().min(1).max(20).default(1),
  raio: z.coerce.number().min(0.5).max(50).default(10),
  categoria: categoryListParam,
  lat: z.string().max(20).optional(),
  lon: z.string().max(20).optional(),
});

/** Converte os parâmetros explícitos nas restrições do motor (sem o "agora", que vem do relógio). */
export function toConstraintsInput(v: z.infer<typeof candidatesParams>, ctx: z.RefinementCtx) {
  const origin = optionalOrigin.safeParse({ lat: v.lat, lon: v.lon });
  if (!origin.success) {
    ctx.addIssue({ code: "custom", message: origin.error.issues[0]?.message ?? "Localização inválida." });
    return z.NEVER;
  }
  return {
    availableMinutes: v.tempo,
    budgetCents: v.orcamento === undefined ? null : v.orcamento * 100,
    people: v.pessoas,
    maxDistanceMeters: Math.round(v.raio * 1000),
    categories: v.categoria,
    avoidCategories: [] as CategoryId[],
    origin: origin.data,
  };
}

/** GET /api/recommendations/candidates */
export const recCandidatesSchema = candidatesParams.transform(toConstraintsInput);

export type RecCandidatesInput = z.infer<typeof recCandidatesSchema>;
