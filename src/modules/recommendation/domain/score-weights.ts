import { z } from "zod";

/** Sinais de score conhecidos. Um sinal novo ganha um id aqui e um peso padrão abaixo. */
export const signalIds = ["preference", "happeningNow", "live", "novelty", "favorite", "proximity"] as const;
export type SignalId = (typeof signalIds)[number];

export type ScoreWeights = Record<SignalId, number>;

/**
 * ÚNICO lugar dos pesos padrão. Score = Σ peso × força do sinal (0 a 1).
 * Em produção, ajuste sem mudar código com `RECOMMENDATION_WEIGHTS` (JSON parcial), ex.: `{"live":5,"novelty":0}`.
 */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  /** Categoria entre as preferidas do perfil. */
  preference: 3,
  /** Acontecendo agora (evento) > começando em breve > lugar aberto agora. */
  happeningNow: 2.5,
  /** Transmissão ao vivo ativa (módulo Live, pela porta `LiveStatusReader`). */
  live: 3,
  /** Publicado/cadastrado há pouco (decai em 14 dias). */
  novelty: 1.5,
  /** Está nos favoritos da pessoa. */
  favorite: 2,
  /** Mais perto pesa mais (só com localização). */
  proximity: 1.5,
};

const weight = z.number().min(0).max(10);
const overridesSchema = z.object(Object.fromEntries(signalIds.map((id) => [id, weight.optional()])) as Record<SignalId, z.ZodOptional<typeof weight>>).strict();

/**
 * Pesos efetivos a partir do JSON de configuração (opcional). Configuração inválida não derruba o app:
 * volta para os padrões e devolve o problema para ser logado.
 */
export function resolveWeights(raw: string | undefined): { weights: ScoreWeights; problem: string | null } {
  if (!raw?.trim()) return { weights: DEFAULT_WEIGHTS, problem: null };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { weights: DEFAULT_WEIGHTS, problem: "RECOMMENDATION_WEIGHTS não é um JSON válido." };
  }
  const parsed = overridesSchema.safeParse(json);
  if (!parsed.success) {
    return { weights: DEFAULT_WEIGHTS, problem: `RECOMMENDATION_WEIGHTS inválido: ${parsed.error.issues.map((i) => `${i.path.join(".") || "raiz"} ${i.message}`).join("; ")}` };
  }
  const overrides = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  return { weights: { ...DEFAULT_WEIGHTS, ...overrides }, problem: null };
}
