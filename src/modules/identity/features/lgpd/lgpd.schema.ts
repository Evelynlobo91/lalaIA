import { z } from "zod";

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

/** Formulário de consentimentos: checkbox marcado = consente; desmarcado = revoga. */
export const consentsSchema = z.object({ analytics: checkbox, geolocation: checkbox });

/** Confirmação explícita da exclusão: digitar EXCLUIR (evita clique acidental). */
export const CONFIRMATION_WORD = "EXCLUIR";
export const deleteAccountSchema = z.object({
  confirmacao: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => v === CONFIRMATION_WORD, `Digite ${CONFIRMATION_WORD} para confirmar.`),
});
