import { ok, type DomainError, type Result } from "@/shared/kernel";
import type { SearchConstraints } from "../../domain/constraints";
import { DEFAULT_TIME_MINUTES, experienceType, peopleByGroup, type ExperienceTypeId } from "../../domain/experience-types";
import type { TasteProfile } from "../../domain/taste-profile";
import type { RecommendNow } from "../rec-score/rec-score.use-case";
import type { RecommendationItem } from "../rec-score/recommendation-item";
import type { ConstraintParams } from "./rec-constraints.schema";

/** Valores efetivos do formulário (para marcar os chips e montar os links). */
export type ConstraintState = {
  tempo: number;
  /** Reais (total do grupo); `null` = sem limite. */
  orcamento: number | null;
  pessoas: number;
  tipo: ExperienceTypeId;
  origin: { lat: number; lon: number } | null;
};

/**
 * RF43 — Restrições da pessoa ("tenho 2 horas, R$70, estou no centro, quero algo diferente") com os
 * padrões vindos do perfil: orçamento, distância e "com quem sai". Função pura, sem framework.
 */
export function resolveConstraints(params: ConstraintParams, profile: TasteProfile, now: Date): { state: ConstraintState; constraints: SearchConstraints } {
  const state: ConstraintState = {
    tempo: params.tempo ?? DEFAULT_TIME_MINUTES,
    orcamento: params.orcamento !== undefined ? params.orcamento : profile.budgetMax,
    pessoas: params.pessoas ?? (profile.groupSize ? peopleByGroup[profile.groupSize] : 1),
    tipo: params.tipo ?? "qualquer",
    origin: params.origin,
  };
  const type = experienceType(state.tipo);
  return {
    state,
    constraints: {
      now,
      availableMinutes: state.tempo,
      budgetCents: state.orcamento === null ? null : state.orcamento * 100,
      people: state.pessoas,
      origin: state.origin,
      maxDistanceMeters: profile.radiusKm * 1000,
      categories: type.categories ? [...type.categories] : null,
      avoidCategories: state.tipo === "diferente" ? [...profile.categories] : [],
    },
  };
}

/** Link do formulário com uma mudança aplicada; preserva o resto do estado (inclusive a localização). */
export function constraintsHref(state: ConstraintState, change: Partial<ConstraintState>, basePath = "/sugestoes"): string {
  const next = { ...state, ...change };
  const query = new URLSearchParams({
    tempo: String(next.tempo),
    orcamento: next.orcamento === null ? "sem" : String(next.orcamento),
    pessoas: String(next.pessoas),
    tipo: next.tipo,
  });
  if (next.origin) {
    query.set("lat", String(next.origin.lat));
    query.set("lon", String(next.origin.lon));
  }
  return `${basePath}?${query.toString()}`;
}

export type ConstrainedRecommendations = { state: ConstraintState; items: RecommendationItem[] };

/** Envia as restrições (com os padrões do perfil da sessão) ao motor e devolve o estado efetivo do formulário. */
export class RecommendWithConstraints {
  constructor(
    private readonly recommend: Pick<RecommendNow, "execute">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { userId: string | null; params: ConstraintParams; limit: number }): Promise<Result<ConstrainedRecommendations, DomainError>> {
    const now = this.clock();
    const result = await this.recommend.execute({
      userId: input.userId,
      limit: input.limit,
      constraintsFor: (profile) => resolveConstraints(input.params, profile, now).constraints,
    });
    if (!result.ok) return result;
    return ok({ state: resolveConstraints(input.params, result.value.profile, now).state, items: result.value.items });
  }
}
