import { z } from "zod";
import { optionalOrigin } from "../rec-candidates/rec-candidates.schema";

/** Entrada do feed "Agora perto de você": só a localização (opcional, arredondada, nunca gravada). */
export const realtimeFeedSchema = z
  .object({ lat: z.string().max(20).optional(), lon: z.string().max(20).optional() })
  .transform((v, ctx) => {
    const origin = optionalOrigin.safeParse(v);
    if (!origin.success) {
      ctx.addIssue({ code: "custom", message: origin.error.issues[0]?.message ?? "Localização inválida." });
      return z.NEVER;
    }
    return { origin: origin.data };
  });

export type RealtimeFeedInput = z.infer<typeof realtimeFeedSchema>;
