import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { SearchConstraints } from "../../domain/constraints";
import type { TasteProfile, TasteProfileReader } from "../../domain/taste-profile";
import type { RecommendationEngine } from "./recommendation-engine";
import { toRecommendationItem, type RecommendationItem } from "./recommendation-item";

export type RecommendNowInput = {
  /** Sempre da sessão (nunca da requisição); `null` = visitante. */
  userId: string | null;
  /** Restrições a partir do perfil (permite padrões vindos das preferências, #73). */
  constraintsFor: (profile: TasteProfile) => SearchConstraints;
  limit: number;
};

export type RecommendationList = { items: RecommendationItem[]; constraints: SearchConstraints; profile: TasteProfile };

/** RF39/RF40/RF41 — Sugestões ranqueadas para a pessoa, agora, com o porquê de cada uma. */
export class RecommendNow {
  constructor(
    private readonly profiles: TasteProfileReader,
    private readonly engine: Pick<RecommendationEngine, "recommend">,
  ) {}

  async execute(input: RecommendNowInput): Promise<Result<RecommendationList, DomainError>> {
    const profile = await this.profiles.profileOf(input.userId);
    const constraints = input.constraintsFor(profile);
    const ranked = await this.engine.recommend(constraints, profile, input.limit);
    return ok({ items: ranked.map((r) => toRecommendationItem(r, constraints.now)), constraints, profile });
  }
}
