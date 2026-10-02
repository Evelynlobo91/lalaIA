import { z } from "zod";
import { leadSources, type LeadData, type LeadSource } from "../../domain/lead";

const sources = leadSources.map((s) => s.id) as [LeadSource, ...LeadSource[]];

export const leadSchema = z
  .object({
    leadId: z.uuid().optional(),
    businessName: z.string().trim().min(2, "Informe o nome do estabelecimento.").max(120, "Use no máximo 120 caracteres."),
    contactName: z.string().trim().min(2, "Informe o nome do contato.").max(120, "Use no máximo 120 caracteres."),
    // Aceita "(47) 3433-0000", "+55 47 99999-0000"...; grava só os dígitos. Vazio = não informado.
    contactPhone: z
      .string()
      .transform((v) => v.replace(/[^\d+]/g, ""))
      .pipe(z.union([z.literal(""), z.string().regex(/^\+?\d{10,13}$/, "Informe um telefone com DDD.")]))
      .transform((v) => v || null),
    contactEmail: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.union([z.literal(""), z.email("Informe um e-mail válido.").max(254)]))
      .transform((v) => v || null),
    source: z.enum(sources, { error: "Escolha a origem." }),
    ownerId: z.uuid({ error: "Escolha o responsável." }),
  })
  .superRefine((v, ctx) => {
    if (!v.contactPhone && !v.contactEmail) ctx.addIssue({ code: "custom", path: ["contactPhone"], message: "Informe um telefone ou um e-mail do contato." });
  })
  .transform(({ leadId, ...data }): { leadId: string | undefined; data: LeadData } => ({ leadId, data }));

export type LeadInput = z.infer<typeof leadSchema>;
