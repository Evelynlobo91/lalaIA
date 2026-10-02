import { z } from "zod";
import { experienceTypeIds } from "../../domain/experience-types";
import { optionalOrigin } from "../rec-candidates/rec-candidates.schema";

/**
 * Estado do formulário de restrições na URL (/sugestoes?tempo=120&orcamento=70&pessoas=2&tipo=diferente&lat=&lon=).
 * Tudo opcional: o que não vier usa os padrões do perfil. `orcamento=sem` = sem limite.
 */
export const constraintParamsSchema = z
  .object({
    tempo: z.coerce.number({ error: "Tempo inválido." }).int("Tempo inválido.").min(15, "Tempo inválido.").max(720, "Tempo inválido.").optional(),
    orcamento: z
      .union([z.literal("sem"), z.coerce.number({ error: "Orçamento inválido." }).int("Orçamento inválido.").min(0, "Orçamento inválido.").max(10_000, "Orçamento inválido.")])
      .optional()
      .transform((v) => (v === "sem" ? null : v)),
    pessoas: z.coerce.number({ error: "Número de pessoas inválido." }).int().min(1, "Número de pessoas inválido.").max(20, "Número de pessoas inválido.").optional(),
    tipo: z.enum(experienceTypeIds, { error: "Tipo de experiência inválido." }).optional(),
    lat: z.string().max(20).optional(),
    lon: z.string().max(20).optional(),
  })
  .transform((v, ctx) => {
    const origin = optionalOrigin.safeParse({ lat: v.lat, lon: v.lon });
    if (!origin.success) {
      ctx.addIssue({ code: "custom", message: origin.error.issues[0]?.message ?? "Localização inválida." });
      return z.NEVER;
    }
    return { tempo: v.tempo, orcamento: v.orcamento, pessoas: v.pessoas, tipo: v.tipo, origin: origin.data };
  });

export type ConstraintParams = z.infer<typeof constraintParamsSchema>;

/** Sem nada na URL: tudo vem do perfil. */
export const noConstraintParams: ConstraintParams = { tempo: undefined, orcamento: undefined, pessoas: undefined, tipo: undefined, origin: null };

/** Parâmetros da URL (página) → restrições; inválido devolve a mensagem e cai nos padrões do perfil. */
export function parseConstraintParams(params: Record<string, string | string[] | undefined>): { params: ConstraintParams; invalid: string | null } {
  const single = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : undefined);
  const parsed = constraintParamsSchema.safeParse({
    tempo: single(params.tempo),
    orcamento: single(params.orcamento),
    pessoas: single(params.pessoas),
    tipo: single(params.tipo),
    lat: single(params.lat),
    lon: single(params.lon),
  });
  return parsed.success ? { params: parsed.data, invalid: null } : { params: noConstraintParams, invalid: parsed.error.issues[0]?.message ?? "Restrição inválida." };
}
