import { z } from "zod";
import { failedPasswordRules } from "../../domain/password-policy";

export const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Informe seu nome.").max(80, "Use no máximo 80 caracteres."),
  // Normaliza antes de validar: autocompletar do celular costuma deixar espaço no fim.
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.").max(254)),
  password: z.string().superRefine((password, ctx) => {
    for (const rule of failedPasswordRules(password)) ctx.addIssue({ code: "custom", message: rule.label });
  }),
  // Checkbox HTML envia "on" quando marcado; sem aceite não há cadastro.
  acceptTerms: z.literal("on", { error: "Você precisa aceitar os Termos de Uso e a Política de Privacidade." }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
