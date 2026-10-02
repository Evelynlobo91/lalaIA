import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { ConstrainedRecommendations, RecommendWithConstraints } from "../rec-constraints/rec-constraints.use-case";
import type { ConstraintParams } from "../rec-constraints/rec-constraints.schema";

/** Quantas missões a seção "Missões para você" mostra. */
export const MISSION_RECOMMENDATIONS_LIMIT = 6;

/** Motivo quando nenhum sinal pontuou (ex.: visitante, sem localização): a tela sempre diz por que sugerimos. */
export const FALLBACK_MISSION_REASON = "Cabe no seu tempo e no seu orçamento";

/**
 * RF27 (#64) — Missões que combinam com a pessoa, da mais relevante para a menos. Reaproveita o motor inteiro
 * (filtros duros de tempo, orçamento, distância e tipo + score com motivos) com uma única fonte de candidatos:
 * as missões. Assim missões e sugestões gerais nunca discordam sobre o que cabe.
 */
export class RecommendMissions {
  constructor(private readonly missionsOnly: Pick<RecommendWithConstraints, "execute">) {}

  async execute(input: { userId: string | null; params: ConstraintParams; limit?: number }): Promise<Result<ConstrainedRecommendations, DomainError>> {
    const result = await this.missionsOnly.execute({ userId: input.userId, params: input.params, limit: input.limit ?? MISSION_RECOMMENDATIONS_LIMIT });
    if (!result.ok) return result;
    const items = result.value.items
      .filter((item) => item.kind === "mission")
      .map((item) => (item.reasons.length > 0 ? item : { ...item, reasons: [FALLBACK_MISSION_REASON] }));
    return ok({ state: result.value.state, items });
  }
}
