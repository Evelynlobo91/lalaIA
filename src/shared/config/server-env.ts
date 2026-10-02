import "server-only";
import { z } from "zod";

// Variáveis de ambiente do servidor, validadas uma única vez. Falha cedo e com mensagem clara.
const serverEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const campos = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${campos}. Veja .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
