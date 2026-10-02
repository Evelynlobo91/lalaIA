import { z } from "zod";

// Variáveis públicas (vão para o navegador). Cada uma é lida explicitamente para o Next embuti-las no build.
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  // URL canônica do app, usada em links de e-mail. Nunca derive do header Host (injeção de host).
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  if (!cached) {
    const parsed = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    });
    if (!parsed.success) {
      const campos = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Variáveis públicas inválidas ou ausentes: ${campos}. Veja .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
