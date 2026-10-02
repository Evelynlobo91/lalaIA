import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "E-mail muito longo.")
    .pipe(z.email("Digite um e-mail válido.")),
});

export const memberIdSchema = z.object({ memberId: z.uuid() });
