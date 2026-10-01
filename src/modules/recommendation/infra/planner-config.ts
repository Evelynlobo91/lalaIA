import "server-only";
import { z } from "zod";
import type { ClaudePlannerConfig } from "./claude-itinerary-planner";

/** Modelo rápido por padrão: o roteiro precisa sair em menos de 8 s. Trocável por `SURPRISE_MODEL`. */
export const DEFAULT_SURPRISE_MODEL = "claude-haiku-4-5-20251001";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  SURPRISE_MODEL: z.string().min(1).max(100).optional(),
});

/**
 * Configuração do planejador com Claude. Sem `ANTHROPIC_API_KEY` (ou com valor inválido) devolve `null`
 * e o "ME SURPREENDA" usa só o motor local. A chave nunca é logada.
 */
export function claudePlannerConfig(env: NodeJS.ProcessEnv = process.env): ClaudePlannerConfig | null {
  const parsed = schema.safeParse({ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || undefined, SURPRISE_MODEL: env.SURPRISE_MODEL || undefined });
  if (!parsed.success || !parsed.data.ANTHROPIC_API_KEY) return null;
  return { apiKey: parsed.data.ANTHROPIC_API_KEY, model: parsed.data.SURPRISE_MODEL ?? DEFAULT_SURPRISE_MODEL, timeoutMs: 7000 };
}
