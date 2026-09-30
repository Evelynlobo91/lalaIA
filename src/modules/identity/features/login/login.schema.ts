import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.").max(254)),
  password: z.string().min(1, "Informe sua senha.").max(200),
  // Para onde voltar depois do login; validado por safeRedirectPath na action.
  next: z.string().max(2048).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
