import { z } from "zod";
import { servicePointShape } from "@/modules/places";

/**
 * Check-in por GPS: a etapa e a posição do toque. lat/lon são arredondadas (~10 m) e precisam estar na área
 * atendida (`servicePointShape`); `accuracy` é a precisão informada pelo navegador, em metros.
 */
export const geofenceCheckInSchema = z.object({
  stepId: z.uuid({ error: "Etapa inválida." }),
  ...servicePointShape,
  accuracy: z.coerce.number({ error: "Precisão inválida." }).refine(Number.isFinite, "Precisão inválida.").min(0, "Precisão inválida.").max(100_000, "Precisão inválida."),
});

export type GeofenceCheckInInput = z.infer<typeof geofenceCheckInSchema>;

/** Posição opcional que acompanha o QR nas etapas "QR + GPS" (vazia nas etapas só de QR). */
export const optionalFixSchema = z
  .object({
    lat: z.string().optional(),
    lon: z.string().optional(),
    accuracy: z.string().optional(),
  })
  .transform((v, ctx) => {
    if (!v.lat && !v.lon && !v.accuracy) return null;
    const parsed = z.object({ ...servicePointShape, accuracy: geofenceCheckInSchema.shape.accuracy }).safeParse(v);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: parsed.error.issues[0]?.message ?? "Localização inválida." });
      return z.NEVER;
    }
    return { lat: parsed.data.lat, lon: parsed.data.lon, accuracyMeters: parsed.data.accuracy };
  });
