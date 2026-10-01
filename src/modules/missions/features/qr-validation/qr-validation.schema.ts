import { z } from "zod";

/** Token do QR (da URL ou do formulário de confirmação). O formato fino e a assinatura são conferidos no caso de uso. */
export const qrTokenSchema = z.string().trim().min(1, "QR code inválido.").max(200, "QR code inválido.");

export const completeStepSchema = z.object({ token: qrTokenSchema });

/** ?impressao=1 → QR que vale até o fim do dia; senão, o da tela (rotativo). */
export const qrModeSchema = z.enum(["screen", "print"]);
