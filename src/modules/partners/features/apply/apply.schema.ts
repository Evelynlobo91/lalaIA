import { z } from "zod";
import { isValidCnpj } from "../../domain/cnpj";
import { partnerKinds } from "../../domain/partner";

const kinds = partnerKinds.map((k) => k.id) as ["estabelecimento", "promotor"];

export const applySchema = z.object({
  kind: z.enum(kinds, { error: "Escolha o tipo de parceiro." }),
  businessName: z.string().trim().min(2, "Informe o nome do negócio.").max(120, "Use no máximo 120 caracteres."),
  // Aceita "(47) 3433-0000", "+55 47 99999-0000"...; grava só os dígitos.
  phone: z
    .string()
    .transform((v) => v.replace(/[^\d+]/g, ""))
    .pipe(z.string().regex(/^\+?\d{10,13}$/, "Informe um telefone com DDD.")),
  // "@lalaia" ou link do perfil → "lalaia". Vazio = não informado.
  instagram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/$/, ""))
    .pipe(z.union([z.literal(""), z.string().regex(/^[A-Za-z0-9._]{1,30}$/, "Informe só o usuário do Instagram (ex.: @seunegocio).")]))
    .transform((v) => v || null),
  cnpj: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidCnpj(v), "CNPJ inválido.")
    .transform((v) => (v === "" ? null : v.replace(/\D/g, ""))),
  description: z.string().trim().min(20, "Conte um pouco mais (pelo menos 20 caracteres).").max(600, "Use no máximo 600 caracteres."),
});

export type ApplyInput = z.infer<typeof applySchema>;
