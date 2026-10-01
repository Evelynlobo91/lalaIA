import { z } from "zod";
import { optionalFixSchema } from "../geofence-validation/geofence-validation.schema";

/** Token do QR (da URL ou do formulário de confirmação). O formato fino e a assinatura são conferidos no caso de uso. */
export const qrTokenSchema = z.string().trim().min(1, "QR code inválido.").max(200, "QR code inválido.");

/** Etapas "QR + GPS" mandam também a posição do toque (lat, lon, accuracy); as de QR, só o token. */
export const completeStepSchema = z
  .object({ token: qrTokenSchema, lat: z.string().optional(), lon: z.string().optional(), accuracy: z.string().optional() })
  .transform(({ token, ...position }, ctx) => {
    const fix = optionalFixSchema.safeParse(position);
    if (!fix.success) {
      ctx.addIssue({ code: "custom", path: ["token"], message: fix.error.issues[0]?.message ?? "Localização inválida." });
      return z.NEVER;
    }
    return { token, fix: fix.data };
  });

/** ?impressao=1 → QR que vale até o fim do dia; senão, o da tela (rotativo). */
export const qrModeSchema = z.enum(["screen", "print"]);
