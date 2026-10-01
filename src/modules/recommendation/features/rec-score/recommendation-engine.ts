import type { Logger } from "@/shared/observability";
import type { Candidate } from "../../domain/candidate";
import type { SearchConstraints } from "../../domain/constraints";
import type { LiveStatusReader } from "../../domain/live-status";
import type { Ranker, Recommendation } from "../../domain/score";
import type { TasteProfile } from "../../domain/taste-profile";

/** Porta da camada 1 (candidatos já filtrados). */
export interface CandidateFinder {
  execute(constraints: SearchConstraints): Promise<Candidate[]>;
}

/**
 * Motor determinístico (camadas 1 + score): candidatos viáveis → ranking explicável → top N.
 * É a porta de entrada do "ME SURPREENDA" (#74): o roteiro do LLM parte de `recommend(..., 20)`,
 * e todo item do roteiro precisa estar nesta lista (a IA nunca inventa lugares).
 */
export class RecommendationEngine {
  constructor(
    private readonly candidates: CandidateFinder,
    private readonly live: LiveStatusReader,
    private readonly ranker: Ranker,
    private readonly log: Pick<Logger, "warn">,
  ) {}

  async recommend(constraints: SearchConstraints, profile: TasteProfile, limit: number): Promise<Recommendation[]> {
    const [candidates, liveKeys] = await Promise.all([
      this.candidates.execute(constraints),
      this.live.liveNow().catch((error: unknown) => {
        this.log.warn("status das lives indisponível", { error: String(error) });
        return new Set<string>() as ReadonlySet<string>;
      }),
    ]);
    return this.ranker.rank(candidates, { constraints, profile, liveKeys }).slice(0, Math.max(0, limit));
  }
}
