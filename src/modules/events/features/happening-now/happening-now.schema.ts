import { z } from "zod";
import { servicePointShape } from "@/modules/places";

const point = z.object(servicePointShape);

/**
 * Entrada da tela "Agora": a localização é opcional (sem ela, não há distância).
 * Se vier, precisa ter lat e lon válidos dentro da área atendida (já arredondados para ~10 m).
 */
export const happeningNowSchema = z
  .object({ lat: z.string().max(20).optional(), lon: z.string().max(20).optional() })
  .transform((value, ctx) => {
    if (value.lat === undefined && value.lon === undefined) return { origin: null };
    const parsed = point.safeParse(value);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: parsed.error.issues[0]?.message ?? "Localização inválida." });
      return z.NEVER;
    }
    return { origin: parsed.data };
  });

export type HappeningNowInput = z.infer<typeof happeningNowSchema>;
