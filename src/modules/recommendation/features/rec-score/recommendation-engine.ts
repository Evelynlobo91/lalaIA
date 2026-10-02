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
/** Porta para os destaques patrocinados (módulo partners): chaves `kind:id` valendo agora. */
export interface SponsoredReader {
  sponsoredNow(): Promise<ReadonlySet<string>>;
}

export class RecommendationEngine {
  constructor(
    private readonly candidates: CandidateFinder,
    private readonly live: LiveStatusReader,
    private readonly ranker: Ranker,
    private readonly log: Pick<Logger, "warn">,
    private readonly sponsored?: SponsoredReader,
  ) {}

  async recommend(constraints: SearchConstraints, profile: TasteProfile, limit: number): Promise<Recommendation[]> {
    const none = new Set<string>() as ReadonlySet<string>;
    const [candidates, liveKeys, sponsoredKeys] = await Promise.all([
      this.candidates.execute(constraints),
      this.live.liveNow().catch((error: unknown) => {
        this.log.warn("status das lives indisponível", { error: String(error) });
        return new Set<string>() as ReadonlySet<string>;
      }),
      // Sem os destaques, o motor segue sem o sinal (e loga).
      this.sponsored
        ? this.sponsored.sponsoredNow().catch((error: unknown) => {
            this.log.warn("destaques patrocinados indisponíveis", { error: String(error) });
            return none;
          })
        : none,
    ]);
    return this.ranker.rank(candidates, { constraints, profile, liveKeys, sponsoredKeys }).slice(0, Math.max(0, limit));
  }
}
