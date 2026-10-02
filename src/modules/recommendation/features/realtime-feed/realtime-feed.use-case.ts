import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { Point } from "../../domain/constraints";
import { noConstraintParams } from "../rec-constraints/rec-constraints.schema";
import { resolveConstraints } from "../rec-constraints/rec-constraints.use-case";
import type { RecommendNow } from "../rec-score/rec-score.use-case";
import type { RecommendationItem } from "../rec-score/recommendation-item";

/** Janela do feed: agora e as próximas 3 horas (a mesma do "em breve" de eventos). */
export const FEED_WINDOW_MINUTES = 180;
/** Itens no feed da home. */
export const FEED_LIMIT = 6;

export type RealtimeFeedView = { items: RecommendationItem[]; nearMe: boolean };

/**
 * RF37/RF40 — "Agora perto de você": o que está acontecendo ou abre nas próximas 3 h, ordenado pelo
 * score (preferências, agora, live, novidade, distância), com os padrões do perfil (orçamento, raio,
 * com quem sai). Sem localização, mostra Joinville toda, sem distância.
 */
export class RealtimeFeed {
  constructor(
    private readonly recommend: Pick<RecommendNow, "execute">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { userId: string | null; origin: Point | null }): Promise<Result<RealtimeFeedView, DomainError>> {
    const now = this.clock();
    const params = { ...noConstraintParams, tempo: FEED_WINDOW_MINUTES, origin: input.origin };
    const result = await this.recommend.execute({
      userId: input.userId,
      limit: FEED_LIMIT,
      constraintsFor: (profile) => resolveConstraints(params, profile, now).constraints,
    });
    if (!result.ok) return result;
    return ok({ items: result.value.items, nearMe: input.origin !== null });
  }
}
